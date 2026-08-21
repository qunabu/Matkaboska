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
export async function syncConnections(
  s: Store, env: Env,
  opts: { connectionId?: number; maxConnections?: number; staleHours?: number } = {},
) {
  const cfg = ebConfig(env)
  if (!cfg) throw new Error('Brak konfiguracji Enable Banking (EB_APPLICATION_ID / EB_PRIVATE_KEY)')

  const where = ["user_id = ?", 'session_id IS NOT NULL', "status = 'AUTHORIZED'"]
  const args: unknown[] = [s.userId]
  if (opts.connectionId) { where.push('id = ?'); args.push(opts.connectionId) }
  if (opts.staleHours) {
    // Najpierw te, które najdłużej czekały — dzięki temu kolejne tyknięcia crona
    // domykają połączenia pominięte w poprzednim przebiegu.
    where.push(`(last_sync_at IS NULL OR last_sync_at < datetime('now', ?))`)
    args.push(`-${opts.staleHours} hours`)
  }
  let conns = await s.all<{ id: number; session_id: string; aspsp_name: string; status: string; psu_ip: string; psu_user_agent: string }>(
    `SELECT id, session_id, aspsp_name, status, psu_ip, psu_user_agent FROM budzet_bank_connections
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(last_sync_at, '') ASC`, ...args)
  if (opts.maxConnections) conns = conns.slice(0, opts.maxConnections)

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

      const accs = await s.all<{ id: number; uid: string; account_id: string; iban: string; last_synced_to: string; cash_account_type: string; kind: string }>(
        `SELECT ba.id, ba.uid, ba.account_id, ba.iban, ba.last_synced_to, ba.cash_account_type,
                COALESCE(a.kind, 'personal') AS kind
           FROM budzet_bank_accounts ba
           LEFT JOIN budzet_accounts a ON a.id = ba.account_id AND a.user_id = ba.user_id
          WHERE ba.user_id = ? AND ba.connection_id = ? AND ba.enabled = 1`,
        s.userId, conn.id)

      let inserted = 0, duplicates = 0
      for (const a of accs) {
        // Banki różnie ograniczają historię: Pekao odmawia powyżej 90 dni,
        // mBank ignoruje parametr i oddaje ~rok. Schodzimy w dół, aż zadziała.
        const windows = a.last_synced_to ? [7] : [89, 60, 30, 7]
        let txs: EbTransaction[] | null = null
        let lastErr: Error | null = null
        for (const w of windows) {
          try { txs = await getTransactions(cfg, a.uid, daysAgo(w), psu); break }
          catch (e) { lastErr = e as Error }
        }
        if (!txs) throw lastErr ?? new Error('Nie udało się pobrać operacji')
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
          const byType = (t: string) => b.balances?.find((x) => (x.balance_type ?? '').toUpperCase() === t)
          const val = (x?: { balance_amount: { amount: string } } | null) =>
            x ? Number(x.balance_amount.amount) : null
          // O tym, że to karta, decyduje typ NASZEGO konta: mBank raportuje kartę
          // kredytową jako CACC, więc poleganie na cash_account_type z API zawodzi.
          const isCard = a.kind === 'credit_card' || (a.cash_account_type ?? '').toUpperCase() === 'CARD'

          const bookedT = byType('CLBD') ?? byType('ITBD')
          const availT = byType('CLAV') ?? byType('ITAV')
          let amount: number | null = null
          let label: string | null = null

          if (isCard) {
            const booked = val(bookedT), avail = val(availT)
            // Dla karty „booked" to przyznany limit, a „available" pozostała jego
            // część — zadłużeniem jest różnica. Zapis któregokolwiek wprost
            // wyglądałby jak kilkanaście tysięcy oszczędności.
            if (booked != null && avail != null && booked >= avail) {
              amount = -(booked - avail)
              label = `${bookedT?.balance_type ?? '?'}-${availT?.balance_type ?? '?'} (zadłużenie)`
            } else if (booked != null) {
              amount = booked
              label = bookedT?.balance_type ?? null
            }
          } else {
            const pick = bookedT ?? availT ?? b.balances?.[0] ?? null
            amount = val(pick)
            label = pick?.balance_type ?? null
          }

          if (amount != null) {
            await s.run(
              'UPDATE budzet_accounts SET current_balance = ?, balance_as_of = ?, balance_type = ? WHERE user_id = ? AND id = ?',
              amount, new Date().toISOString().slice(0, 10), label, s.userId, a.account_id)
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
