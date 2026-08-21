import { Store } from './store'
import { ingestRows } from './importer'
import { accountIdFor, normaliseMerchant, hash, type ParsedRow } from './parsers'
import { ebConfig, getTransactions, getBalances, getSession, type EbTransaction, type EbAccount } from './enablebanking'

type Env = { EB_APPLICATION_ID?: string; EB_PRIVATE_KEY?: string }

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()
/** IBAN-y z API mają prefiks kraju („PL46…"), a te z wyciągów CSV zwykle nie.
 *  Porównujemy po samych cyfrach, inaczej powstałyby zdublowane rachunki. */
const ibanDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '')

/** Transakcja Enable Banking -> wiersz w formacie wspólnym z parserami CSV. */
export function mapTransaction(t: EbTransaction, accountId: string, accountKey: string): ParsedRow | null {
  const booked = t.booking_date || t.value_date || t.transaction_date
  if (!booked) return null
  const raw = Number(t.transaction_amount?.amount)
  if (!Number.isFinite(raw)) return null
  const amount = t.credit_debit_indicator === 'CRDT' ? Math.abs(raw) : -Math.abs(raw)

  const description = clean((t.remittance_information ?? []).join(' ')) || clean(t.note)
  // Kontrahentem jest ta strona, która nie jest nami: przy wydatku odbiorca,
  // przy wpływie nadawca.
  const counterparty = clean(amount < 0 ? t.creditor?.name : t.debtor?.name)
    || description.split(/\s{2,}/)[0] || 'Nieznany'
  const opType = clean(t.bank_transaction_code?.description)
  const reference = clean(t.entry_reference) || clean(t.transaction_id) || null

  return {
    account_key: accountKey,
    account_id: accountId,
    account_name: accountKey,
    bank: 'API',
    booked_on: booked.slice(0, 10),
    value_on: (t.value_date ?? booked).slice(0, 10),
    amount,
    currency: t.transaction_amount?.currency || 'PLN',
    counterparty,
    counterparty_norm: normaliseMerchant(counterparty),
    description,
    address: null,
    src_iban: clean(t.debtor_account?.iban) || null,
    dst_iban: clean(t.creditor_account?.iban) || null,
    bank_category: '',
    op_type: opType || null,
    reference,
    haystack: [counterparty, description, opType].filter(Boolean).join(' | '),
    dedupe_key: `eb:${hash([reference ?? '', accountId, amount.toFixed(2), booked].join('|'))}`,
  }
}

/** Ostatnie cztery cyfry z etykiety rachunku — dla kart to jedyny wspólny
 *  mianownik między maską z wyciągu („5396********1087") a danymi z API. */
const last4 = (s?: string | null) => {
  const groups = (s ?? '').match(/\d{4,}/g)
  return groups?.length ? groups[groups.length - 1]!.slice(-4) : null
}

/** Typ rachunku z API na nasze kategorie kont. */
function kindFor(acc: EbAccount): string {
  const t = (acc.cash_account_type ?? '').toUpperCase()
  if (t === 'CARD') return 'credit_card'
  const label = `${acc.name ?? ''} ${acc.product ?? ''}`.toUpperCase()
  if (/MASTERCARD|VISA|KARTA KREDYT|CREDIT CARD/.test(label)) return 'credit_card'
  return 'personal'
}

/** Konto z banku wiążemy z istniejącym rachunkiem — po IBAN-ie, a dla kart po
 *  końcówce numeru. Inaczej dane z API utworzyłyby duplikat obok konta z CSV. */
async function resolveAccountId(s: Store, acc: EbAccount): Promise<string> {
  const kind = kindFor(acc)
  const existing = await s.all<{ id: string; iban: string | null; source_key: string | null; kind: string }>(
    'SELECT id, iban, source_key, kind FROM budzet_accounts WHERE user_id = ?', s.userId)
  const iban = clean(acc.account_id?.iban)

  if (iban) {
    const want = ibanDigits(iban)
    const hit = existing.find((a) => a.iban && ibanDigits(a.iban) === want)
    if (hit) return hit.id
    const id = accountIdFor(iban)
    await s.run(
      `INSERT INTO budzet_accounts(user_id, id, iban, source_key, name, short, kind, bank)
       VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id, id) DO NOTHING`,
      s.userId, id, iban, iban,
      clean(acc.name) || clean(acc.product) || `Rachunek ${iban.slice(-4)}`,
      (clean(acc.name) || `…${iban.slice(-4)}`).slice(0, 24), kind, 'API')
    return id
  }

  // Bez IBAN-u (typowo karta): dopasowanie po końcówce numeru do konta z wyciągu.
  const tail = last4(`${acc.name ?? ''} ${acc.product ?? ''} ${acc.details ?? ''} ${acc.account_id?.other?.identification ?? ''}`)
  if (tail) {
    const hit = existing.find((a) => last4(a.source_key) === tail || (a.iban && a.iban.endsWith(tail)))
    if (hit) return hit.id
  }

  const stable = clean(acc.identification_hash) || acc.uid
  const id = `acc_${hash(stable).slice(0, 10)}`
  await s.run(
    `INSERT INTO budzet_accounts(user_id, id, iban, source_key, name, short, kind, bank)
     VALUES(?,?,NULL,?,?,?,?,?) ON CONFLICT(user_id, id) DO NOTHING`,
    s.userId, id, stable, clean(acc.name) || clean(acc.product) || 'Rachunek bankowy',
    (clean(acc.name) || clean(acc.product) || 'Rachunek').slice(0, 24), kind, 'API')
  return id
}

export async function saveSessionAccounts(
  s: Store, connectionId: number, accounts: EbAccount[],
) {
  for (const a of accounts) {
    const accountId = await resolveAccountId(s, a)
    await s.run(
      `INSERT INTO budzet_bank_accounts(user_id, connection_id, uid, iban, name, currency, account_id,
         identification_hash, cash_account_type)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      s.userId, connectionId, a.uid, clean(a.account_id?.iban) || null,
      clean(a.name) || clean(a.product) || null, a.currency ?? null, accountId,
      clean(a.identification_hash) || null, clean(a.cash_account_type) || null)
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/**
 * Pobiera nowe operacje ze wszystkich aktywnych połączeń.
 * Okno startowe cofamy o 7 dni względem ostatniej synchronizacji, bo banki
 * doksięgowują operacje wstecz; duplikaty i tak odsiewa `ingestRows`.
 */
export async function syncConnections(s: Store, env: Env, opts: { connectionId?: number } = {}) {
  const cfg = ebConfig(env)
  if (!cfg) throw new Error('Brak konfiguracji Enable Banking (EB_APPLICATION_ID / EB_PRIVATE_KEY)')

  const conns = await s.all<{ id: number; session_id: string; aspsp_name: string; status: string; psu_ip: string; psu_user_agent: string }>(
    `SELECT id, session_id, aspsp_name, status, psu_ip, psu_user_agent FROM budzet_bank_connections
      WHERE user_id = ? AND session_id IS NOT NULL AND status = 'AUTHORIZED'
        ${opts.connectionId ? 'AND id = ?' : ''}`,
    ...(opts.connectionId ? [s.userId, opts.connectionId] : [s.userId]))

  const results: { connection: string; accounts: number; inserted: number; duplicates: number; error?: string }[] = []
  for (const conn of conns) {
    try {
      // Bank mógł unieważnić zgodę przed jej datą ważności.
      // Te same nagłówki PSU, które bank widział przy autoryzacji.
      const psu = { ip: conn.psu_ip || undefined, userAgent: conn.psu_user_agent || undefined }
      const sess = await getSession(cfg, conn.session_id, psu)
      if (sess.status && sess.status !== 'AUTHORIZED') {
        await s.run(
          "UPDATE budzet_bank_connections SET status = ?, last_error = 'Zgoda wygasła — połącz konto ponownie' WHERE id = ? AND user_id = ?",
          sess.status, conn.id, s.userId)
        results.push({ connection: conn.aspsp_name, accounts: 0, inserted: 0, duplicates: 0, error: 'zgoda wygasła' })
        continue
      }

      const accs = await s.all<{ id: number; uid: string; account_id: string; iban: string; last_synced_to: string; cash_account_type: string }>(
        `SELECT id, uid, account_id, iban, last_synced_to, cash_account_type
           FROM budzet_bank_accounts WHERE user_id = ? AND connection_id = ? AND enabled = 1`,
        s.userId, conn.id)

      let inserted = 0, duplicates = 0
      for (const a of accs) {
        const from = a.last_synced_to ? daysAgo(7) : daysAgo(89)
        const txs = await getTransactions(cfg, a.uid, from, psu)
        // Tylko operacje zaksięgowane: oczekujące zmieniają identyfikator po
        // rozliczeniu i weszłyby drugi raz.
        const rows = txs
          .filter((t) => !t.status || t.status === 'BOOK')
          .map((t) => mapTransaction(t, a.account_id, a.iban || a.uid))
          .filter((r): r is ParsedRow => r !== null)
        if (rows.length) {
          const r = await ingestRows(s, rows, {
            filename: `${conn.aspsp_name} — API`, format: 'enablebanking',
            fileHash: hash(`${conn.id}:${a.uid}:${new Date().toISOString().slice(0, 13)}`),
          })
          inserted += r.inserted
          duplicates += r.duplicates
        }
        await s.run('UPDATE budzet_bank_accounts SET last_synced_to = ? WHERE id = ? AND user_id = ?',
          new Date().toISOString().slice(0, 10), a.id, s.userId)

        // Saldo z banku zasila poduszkę finansową i „ile mogę odłożyć".
        try {
          const b = await getBalances(cfg, a.uid, psu)
          const isCard = (a.cash_account_type ?? '').toUpperCase() === 'CARD'
          const byType = (t: string) => b.balances?.find((x) => (x.balance_type ?? '').toUpperCase() === t)
          // Przy karcie CLAV/ITAV to DOSTĘPNY LIMIT, nie stan środków — zapisany
          // jako saldo wyglądałby jak kilka tysięcy oszczędności. Bierzemy więc
          // wyłącznie saldo księgowe.
          const pick = isCard
            ? (byType('CLBD') ?? byType('ITBD') ?? null)
            : (byType('CLBD') ?? byType('CLAV') ?? byType('ITAV') ?? b.balances?.[0] ?? null)
          if (pick) {
            await s.run(
              'UPDATE budzet_accounts SET current_balance = ?, balance_as_of = ?, balance_type = ? WHERE user_id = ? AND id = ?',
              Number(pick.balance_amount.amount), new Date().toISOString().slice(0, 10),
              pick.balance_type ?? null, s.userId, a.account_id)
          }
        } catch { /* saldo jest dodatkiem — brak nie przerywa synchronizacji */ }
      }

      await s.run(
        'UPDATE budzet_bank_connections SET last_sync_at = ?, last_error = NULL WHERE id = ? AND user_id = ?',
        new Date().toISOString(), conn.id, s.userId)
      results.push({ connection: conn.aspsp_name, accounts: accs.length, inserted, duplicates })
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300)
      await s.run('UPDATE budzet_bank_connections SET last_error = ? WHERE id = ? AND user_id = ?',
        msg, conn.id, s.userId)
      results.push({ connection: conn.aspsp_name, accounts: 0, inserted: 0, duplicates: 0, error: msg })
    }
  }
  return { connections: conns.length, results }
}
