import { Store, getSettings } from './store'
import { detectAndParse, accountIdFor, guessKind, hash, type ParsedRow } from './parsers'
import { loadRules, matchRule, matchBankCategory, inferBusiness, seedRulesIfEmpty } from './rules'
import { CATEGORIES } from './categories'
import { defaultTargetFor } from './structure'

const TRAVEL_CATS = ['podroz_loty', 'podroz_nocleg', 'podroz_atrakcje', 'podroz_inne']

/** Tworzy brakujące rachunki wykryte w wyciągu. Istniejących nie nadpisuje —
 *  użytkownik mógł je nazwać po swojemu. */
export async function ensureAccounts(s: Store, rows: ParsedRow[]) {
  const existing = new Set((await s.all<{ id: string }>(
    'SELECT id FROM budzet_accounts WHERE user_id = ?', s.userId)).map((a) => a.id))
  const seen = new Map<string, ParsedRow>()
  for (const r of rows) {
    if (r.account_id) continue          // konto już wskazane wprost
    if (!seen.has(r.account_key)) seen.set(r.account_key, r)
  }

  const stmts = []
  for (const [key, r] of seen) {
    const id = accountIdFor(key)
    if (existing.has(id)) continue
    const isIban = /^\d{20,}$/.test(key)
    stmts.push(s.stmt(
      `INSERT INTO budzet_accounts(user_id, id, iban, source_key, name, short, kind, bank) VALUES(?,?,?,?,?,?,?,?)`,
      s.userId, id, isIban ? key : null, key,
      isIban ? `${r.bank} ${key.slice(-6)}` : r.account_name,
      isIban ? `${r.bank} …${key.slice(-4)}` : r.account_name.slice(0, 24),
      guessKind(r.account_name), r.bank))
    existing.add(id)
  }
  await s.batch(stmts)
}

/**
 * Wyciąg mBanku podaje rachunek jako maskę („mKonto Intensive 4711 … 6188"),
 * więc konto powstaje bez IBAN-u. Dopasowujemy go po pierwszych i ostatnich
 * czterech cyfrach do IBAN-ów widocznych w przelewach z innych banków — bez tego
 * przelew Pekao→mBank nie zostałby rozpoznany jako własny.
 */
export async function inferAccountIbans(s: Store) {
  const accs = await s.all<{ id: string; label: string }>(
    `SELECT id, COALESCE(source_key, name) AS label FROM budzet_accounts
      WHERE user_id = ? AND iban IS NULL`, s.userId)
  if (!accs.length) return 0
  const seen = await s.all<{ i: string }>(
    `SELECT DISTINCT src_iban i FROM budzet_transactions WHERE user_id = ?1 AND src_iban IS NOT NULL
     UNION SELECT DISTINCT dst_iban FROM budzet_transactions WHERE user_id = ?1 AND dst_iban IS NOT NULL`, s.userId)
  const known = new Set((await s.all<{ iban: string }>(
    'SELECT iban FROM budzet_accounts WHERE user_id = ? AND iban IS NOT NULL', s.userId)).map((r) => r.iban))
  let n = 0
  for (const a of accs) {
    const groups = String(a.label).match(/\d{4,}/g) ?? []
    if (groups.length < 2) continue
    const head = groups[0] ?? '', tail = groups[groups.length - 1] ?? ''
    if (!head || !tail) continue
    const hit = seen.map((r) => r.i).find((i) => !known.has(i) && i.startsWith(head) && i.endsWith(tail))
    if (!hit) continue
    await s.run('UPDATE budzet_accounts SET iban = ? WHERE user_id = ? AND id = ?', hit, s.userId, a.id)
    known.add(hit)
    n++
  }
  return n
}

export async function seedStructureIfEmpty(s: Store) {
  const row = await s.first<{ c: number }>('SELECT COUNT(*) c FROM budzet_category_targets WHERE user_id = ?', s.userId)
  if ((row?.c ?? 0) > 0) return 0
  await s.batch(CATEGORIES.map((c) => s.stmt(
    'INSERT INTO budzet_category_targets(user_id, category_id, target) VALUES(?,?,?)',
    s.userId, c.id, defaultTargetFor(c.id))))
  return CATEGORIES.length
}

/**
 * Import jednego pliku CSV. Idempotentny: klucz deduplikacji to numer
 * referencyjny + konto + kwota + data, więc nakładające się eksporty nie tworzą
 * duplikatów.
 */
export async function importCsv(s: Store, text: string, filename: string) {
  const { format, rows } = detectAndParse(text, filename)
  const res = await ingestRows(s, rows, { filename, format, fileHash: hash(text) })
  return { format, ...res }
}

/**
 * Wspólne wejście dla wyciągów CSV i pobrań przez API bankowe.
 *
 * Deduplikacja jest dwustopniowa, bo ta sama operacja przychodzi z dwóch źródeł
 * pod różnymi identyfikatorami:
 *  1. `dedupe_key` — dokładny klucz źródła (ten sam plik wgrany dwa razy),
 *  2. dopasowanie po koncie i kwocie w OKNIE ±4 dni, liczone jako wielozbiór.
 *
 * Okno jest konieczne, bo banki datują tę samą operację różnie w zależności od
 * kanału: mBank podaje w CSV datę operacji, a w API datę księgowania — zwykle
 * o dzień późniejszą. Dopasowanie po dokładnej dacie przepuściłoby prawie
 * tysiąc zdublowanych wierszy. Wielozbiór (każdy istniejący wiersz może
 * „skonsumować" tylko jedną nową operację) sprawia, że dwie prawdziwie
 * identyczne płatności nadal wchodzą obie.
 */
export async function ingestRows(
  s: Store, rows: ParsedRow[],
  meta: { filename: string; format: string; fileHash: string },
) {
  await ensureAccounts(s, rows)
  await seedRulesIfEmpty(s)
  await seedStructureIfEmpty(s)

  const kinds = Object.fromEntries((await s.all<{ id: string; kind: string }>(
    'SELECT id, kind FROM budzet_accounts WHERE user_id = ?', s.userId)).map((a) => [a.id, a.kind]))
  const known = new Set((await s.all<{ dedupe_key: string }>(
    'SELECT dedupe_key FROM budzet_transactions WHERE user_id = ?', s.userId)).map((r) => r.dedupe_key))

  const WINDOW_DAYS = 4
  const dayNum = (d: string) => Math.round(Date.parse(d) / 86400000)
  const bucketKey = (accountId: string, amount: number) => `${accountId}|${amount.toFixed(2)}`
  const buckets = new Map<string, { day: number; used: boolean }[]>()
  for (const e of await s.all<{ account_id: string; booked_on: string; amount: number }>(
    'SELECT account_id, booked_on, amount FROM budzet_transactions WHERE user_id = ?', s.userId)) {
    const k = bucketKey(e.account_id, e.amount)
    const list = buckets.get(k) ?? []
    list.push({ day: dayNum(e.booked_on), used: false })
    buckets.set(k, list)
  }

  const fresh: ParsedRow[] = []
  let dup = 0
  for (const r of rows) {
    if (known.has(r.dedupe_key)) { dup++; continue }
    const accountId = r.account_id ?? accountIdFor(r.account_key)
    const k = bucketKey(accountId, r.amount)
    const list = buckets.get(k)
    const day = dayNum(r.booked_on)
    const hit = list?.find((x) => !x.used && Math.abs(x.day - day) <= WINDOW_DAYS)
    if (hit) { hit.used = true; dup++; continue }
    fresh.push(r)
    known.add(r.dedupe_key)
    // Wstawiany wiersz też wchodzi do puli — inaczej kolejne pozycje z tej samej
    // paczki mogłyby się z nim rozminąć i wejść drugi raz.
    const own = buckets.get(k) ?? []
    own.push({ day, used: true })
    buckets.set(k, own)
  }

  const dates = rows.map((r) => r.booked_on).sort()
  const imp = await s.d1.prepare(
    `INSERT INTO budzet_imports(user_id, filename, file_hash, format, imported_at, rows_parsed, rows_new, rows_dup, period_from, period_to)
     VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(s.userId, meta.filename, meta.fileHash, meta.format, new Date().toISOString(),
      rows.length, fresh.length, dup, dates[0] ?? null, dates[dates.length - 1] ?? null)
    .run()
  const importId = (imp.meta as { last_row_id?: number })?.last_row_id ?? null

  const rules = await loadRules(s)
  await s.batch(fresh.map((r) => {
    const accountId = r.account_id ?? accountIdFor(r.account_key)
    const rule = matchRule(rules, r.haystack, r.amount)
    const b = inferBusiness(rule ? rule.is_business : null, kinds[accountId] ?? 'personal')
    const fromBank = rule ? null : matchBankCategory(r.bank_category)
    return s.stmt(
      `INSERT INTO budzet_transactions(
         user_id, dedupe_key, import_id, account_id, booked_on, value_on, month, amount, currency,
         counterparty, counterparty_norm, description, address, src_iban, dst_iban,
         bank_category, op_type, reference, haystack,
         category_id, category_source, rule_id, is_business, business_source)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.userId, r.dedupe_key, importId, accountId, r.booked_on, r.value_on,
      r.booked_on.slice(0, 7), r.amount, r.currency,
      r.counterparty, (rule && rule.label) || r.counterparty_norm, r.description, r.address,
      r.src_iban, r.dst_iban, r.bank_category, r.op_type, r.reference, r.haystack,
      rule ? rule.category_id : (fromBank ?? 'do_sklasyfikowania'),
      rule ? 'rule' : (fromBank ? 'bank' : 'none'),
      rule ? rule.id : null, b.value, b.source)
  }))

  await inferAccountIbans(s)
  const transfers = await linkInternalTransfers(s)
  await assignTripSpending(s)
  return { parsed: rows.length, inserted: fresh.length, duplicates: dup, importId, transfers }
}

/**
 * Paruje obie strony przelewów między własnymi rachunkami i oznacza je jako
 * wewnętrzne, żeby nie zawyżały przychodów ani wydatków.
 */
export async function linkInternalTransfers(s: Store) {
  await s.run('UPDATE budzet_transactions SET is_internal = 0, transfer_group = NULL WHERE user_id = ?', s.userId)

  // 1) Oba IBAN-y należą do nas.
  await s.run(`
    UPDATE budzet_transactions
       SET is_internal = 1, category_id = 'transfer_wlasny', category_source = 'rule'
     WHERE user_id = ?1 AND src_iban IS NOT NULL AND dst_iban IS NOT NULL
       AND src_iban IN (SELECT iban FROM budzet_accounts WHERE user_id = ?1 AND iban IS NOT NULL)
       AND dst_iban IN (SELECT iban FROM budzet_accounts WHERE user_id = ?1 AND iban IS NOT NULL)`, s.userId)

  // 2) Druga noga przelewu w wyciągu bez IBAN-ów (np. Pekao -> mBank).
  const known = await s.all<{ id: number; account_id: string; booked_on: string; amount: number; src_iban: string; dst_iban: string }>(
    `SELECT id, account_id, booked_on, amount, src_iban, dst_iban FROM budzet_transactions
      WHERE user_id = ? AND is_internal = 1 AND src_iban IS NOT NULL AND dst_iban IS NOT NULL`, s.userId)
  const accByIban = Object.fromEntries((await s.all<{ id: string; iban: string }>(
    'SELECT id, iban FROM budzet_accounts WHERE user_id = ? AND iban IS NOT NULL', s.userId)).map((a) => [a.iban, a.id]))

  for (const k of known) {
    const otherIban = k.amount < 0 ? k.dst_iban : k.src_iban
    const otherAcc = accByIban[otherIban]
    if (!otherAcc || otherAcc === k.account_id) continue
    const leg = await s.first<{ id: number }>(
      `SELECT id FROM budzet_transactions
        WHERE user_id = ? AND is_internal = 0 AND account_id = ? AND ABS(amount - ?) < 0.01
          AND ABS(julianday(booked_on) - julianday(?)) <= 4 LIMIT 1`,
      s.userId, otherAcc, -k.amount, k.booked_on)
    if (leg) {
      await s.run(
        `UPDATE budzet_transactions SET is_internal = 1, transfer_group = ?,
                category_id = 'transfer_wlasny', category_source = 'rule' WHERE id = ?`,
        `tg${k.id}`, leg.id)
    }
  }

  // 3) Parowanie heurystyczne dla wyciągów bez IBAN-ów (m.in. spłaty karty).
  const cands = await s.all<{ id: number; account_id: string; booked_on: string; amount: number }>(
    `SELECT id, account_id, booked_on, amount FROM budzet_transactions
      WHERE user_id = ? AND is_internal = 0 AND excluded = 0
        AND category_id <> 'transfer_gospod' AND ABS(amount) >= 50
      ORDER BY booked_on`, s.userId)
  const outs = cands.filter((c) => c.amount < 0)
  const ins = cands.filter((c) => c.amount > 0)
  const usedIn = new Set<number>()
  const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)
  const stmts = []
  let pairs = 0
  for (const o of outs) {
    const hit = ins.find((i) => !usedIn.has(i.id) && i.account_id !== o.account_id &&
      Math.abs(i.amount + o.amount) < 0.01 && dayDiff(i.booked_on, o.booked_on) <= 4)
    if (!hit) continue
    usedIn.add(hit.id)
    const g = `tg${o.id}`
    stmts.push(s.stmt("UPDATE budzet_transactions SET transfer_group = ? WHERE id = ?", g, o.id))
    stmts.push(s.stmt("UPDATE budzet_transactions SET transfer_group = ? WHERE id = ?", g, hit.id))
    pairs++
  }
  await s.batch(stmts)

  // 4) Sparowane przelewy własne są wewnętrzne.
  await s.run(
    `UPDATE budzet_transactions SET is_internal = 1
      WHERE user_id = ? AND category_id = 'transfer_wlasny' AND transfer_group IS NOT NULL`, s.userId)

  // 5) Przelew własny bez drugiej nogi pochodzi z rachunku, którego nie
  //    eksportujemy (np. konto gospodarstwa). To realny ruch gotówki.
  await s.run(`
    UPDATE budzet_transactions
       SET category_id = CASE WHEN amount > 0 THEN 'zwrot_gospod' ELSE 'transfer_gospod' END,
           is_internal = 0
     WHERE user_id = ?1 AND category_id = 'transfer_wlasny' AND transfer_group IS NULL
       -- Uwaga: konta bez IBAN-u (mBank) muszą wypaść z listy, inaczej pusty ciąg
       -- pasowałby do wszystkiego i ukryłby realny ruch gotówki.
       AND NOT (src_iban IS NOT NULL AND dst_iban IS NOT NULL
                AND src_iban IN (SELECT iban FROM budzet_accounts WHERE user_id = ?1 AND iban IS NOT NULL)
                AND dst_iban IN (SELECT iban FROM budzet_accounts WHERE user_id = ?1 AND iban IS NOT NULL))`,
    s.userId)

  return pairs
}

/** Ponowna kategoryzacja: reguły, potem od nowa przelewy i wyjazdy. */
export async function recategoriseAll(s: Store, opts: { includeManual?: boolean } = {}) {
  await inferAccountIbans(s)
  await s.run('UPDATE budzet_transactions SET is_internal = 0, transfer_group = NULL WHERE user_id = ?', s.userId)
  const rules = await loadRules(s)
  const rows = await s.all<{ id: number; haystack: string; amount: number; bank_category: string; account_kind: string }>(
    `SELECT t.id, t.haystack, t.amount, t.bank_category, COALESCE(a.kind,'personal') AS account_kind
       FROM budzet_transactions t
       LEFT JOIN budzet_accounts a ON a.id = t.account_id AND a.user_id = t.user_id
      WHERE t.user_id = ? ${opts.includeManual ? '' : "AND t.category_source <> 'manual'"}`, s.userId)

  // Grupujemy po wyniku dopasowania — jedno UPDATE na wynik zamiast na wiersz.
  const groups = new Map<string, { ids: number[]; set: string }>()
  let matched = 0
  for (const r of rows) {
    const rule = matchRule(rules, r.haystack, r.amount)
    const b = inferBusiness(rule ? rule.is_business : null, r.account_kind)
    const fromBank = rule ? null : matchBankCategory(r.bank_category)
    if (rule || fromBank) matched++
    const cat = rule ? rule.category_id : (fromBank ?? 'do_sklasyfikowania')
    const srcTag = rule ? 'rule' : (fromBank ? 'bank' : 'none')
    const label = rule?.label ?? null
    const key = `${cat}|${srcTag}|${rule?.id ?? ''}|${label ?? ''}|${b.value}|${b.source}`
    const set = `category_id='${cat.replace(/'/g, "''")}', category_source='${srcTag}', ` +
      `rule_id=${rule ? rule.id : 'NULL'}, ` +
      (label ? `counterparty_norm='${label.replace(/'/g, "''")}', ` : '') +
      `is_business=${b.value}, business_source='${b.source}'`
    const g = groups.get(key) ?? { ids: [], set }
    g.ids.push(r.id)
    groups.set(key, g)
  }

  const stmts = []
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 200) {
      // Identyfikatory pochodzą z naszej bazy i są liczbami — wstawiamy je wprost,
      // żeby nie przekroczyć limitu parametrów wiązanych.
      const ids = g.ids.slice(i, i + 200).join(',')
      stmts.push(s.stmt(`UPDATE budzet_transactions SET ${g.set} WHERE id IN (${ids})`))
    }
  }
  await s.batch(stmts)

  await s.run('UPDATE budzet_rules SET hits = 0 WHERE user_id = ?', s.userId)
  await s.run(`UPDATE budzet_rules SET hits = (
      SELECT COUNT(*) FROM budzet_transactions t WHERE t.rule_id = budzet_rules.id AND t.user_id = ?1
    ) WHERE user_id = ?1`, s.userId)

  const transfers = await linkInternalTransfers(s)
  const trip = await assignTripSpending(s)
  return { total: rows.length, matched, transfers, trip }
}

/**
 * Jedzenie i wyjścia w oknie wykrytego wyjazdu to koszt podróży, nie zwykłego
 * miesiąca. Krok jest odwracalny (orig_category_id), więc ponowne przeliczenie
 * nie kumuluje zmian.
 */
export async function assignTripSpending(s: Store) {
  await s.run(
    `UPDATE budzet_transactions SET category_id = orig_category_id, orig_category_id = NULL
      WHERE user_id = ? AND orig_category_id IS NOT NULL`, s.userId)

  const ph = TRAVEL_CATS.map(() => '?').join(',')
  const txs = await s.all<{ booked_on: string }>(
    `SELECT booked_on FROM budzet_transactions
      WHERE user_id = ? AND is_internal = 0 AND excluded = 0 AND amount < 0
        AND category_id IN (${ph}) ORDER BY booked_on`, s.userId, ...TRAVEL_CATS)
  if (!txs.length) return { windows: 0, moved: 0 }

  const clusters: string[][] = []
  let cur = [txs[0].booked_on]
  for (let i = 1; i < txs.length; i++) {
    const gap = (Date.parse(txs[i].booked_on) - Date.parse(txs[i - 1].booked_on)) / 86400000
    if (gap > 6) { clusters.push(cur); cur = [] }
    cur.push(txs[i].booked_on)
  }
  clusters.push(cur)

  // Tylko okna typu „wyjazd": min. 3 dni i 4 transakcje. Pojedyncza rezerwacja
  // z wyprzedzeniem nie przesuwa niczego.
  const windows = clusters.filter((c) => {
    const days = Math.round((Date.parse(c[c.length - 1]) - Date.parse(c[0])) / 86400000) + 1
    return days >= 3 && c.length >= 4
  })
  let moved = 0
  for (const w of windows) {
    const r = await s.run(
      `UPDATE budzet_transactions
          SET orig_category_id = category_id, category_id = 'podroz_inne'
        WHERE user_id = ? AND booked_on BETWEEN ? AND ?
          AND is_business = 0 AND is_internal = 0 AND category_source <> 'manual'
          AND category_id IN ('jedzenie_poza','rozrywka','alkohol')`,
      s.userId, w[0], w[w.length - 1])
    moved += (r.meta as { changes?: number })?.changes ?? 0
  }
  return { windows: windows.length, moved }
}
