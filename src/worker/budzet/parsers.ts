// Parsery wyciągów bankowych. Czyste funkcje — bez dostępu do bazy.
// Konta NIE są konfigurowane: właścicielem wiersza jest rachunek źródłowy przy
// kwocie ujemnej i docelowy przy dodatniej, więc zbiór własnych rachunków wynika
// wprost z pliku. Dzięki temu moduł działa dla dowolnego użytkownika.

export type ParsedRow = {
  account_key: string          // IBAN albo etykieta konta z wyciągu
  account_id?: string          // jawne wskazanie konta (źródła API, gdzie klucz nie wystarcza)
  account_name: string
  bank: string
  booked_on: string
  value_on: string | null
  amount: number
  currency: string
  counterparty: string
  counterparty_norm: string
  description: string
  address: string | null
  src_iban: string | null
  dst_iban: string | null
  bank_category: string
  op_type: string | null
  reference: string | null
  haystack: string
  dedupe_key: string
}

export type ParseResult = { format: 'pekao' | 'mbank'; rows: ParsedRow[] }

/** CSV z separatorem ';' i cudzysłowami (opis mBanku bywa zawiera średnik). */
export function splitCsv(text: string, sep = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch === '\r') { /* pomiń */ }
    else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const clean = (s: unknown) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim())
const stripIban = (s: unknown) => clean(s).replace(/^'/, '').replace(/\s/g, '')

/** "-1 234,56" | "-8,69 PLN" -> -1234.56 */
function parseAmount(raw: unknown): number | null {
  const s = clean(raw).replace(/[A-Za-zł]/g, '').replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && s !== '' ? n : null
}

const isoFromDots = (s: unknown) => {
  const m = clean(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
const isoPlain = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(s)) ? clean(s) : null)

/** FNV-1a 64-bit w hex. Klucz deduplikacji, nie kryptografia — musi być tylko
 *  deterministyczny i synchroniczny (Workers nie mają sync SHA). */
export function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** Tekst do dopasowania regułami — bez szumu zmiennego między eksportami. */
function buildHaystack(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' | ')
    .replace(/transakcja nierozliczona/gi, '')
    .replace(/\s+/g, ' ').trim()
}

/** Nazwa sprzedawcy bez identyfikatorów terminala, miast i numerów referencyjnych. */
export function normaliseMerchant(raw: string): string {
  let s = clean(raw)
    .replace(/\bZAKUP PRZY UŻYCIU KARTY.*$/i, '')
    .replace(/\bBLIK REF\s*\d+/gi, '')
    .replace(/\bREF\s*\d{6,}/gi, '')
    .replace(/\/OPT\/X\/+/g, ' ')
    .replace(/\bBPID:[A-Z0-9]+/gi, '')
    .replace(/\bTRANSAKCJA\b.*$/i, '')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/\s+(GDANSK|GDAŃSK|GDYNIA|SOPOT|WARSZAWA|WARSAW|POZNAN|POZNAŃ|KRAKOW|KRAKÓW|WROCLAW|WROCŁAW|KOSCIERZYNA|USTKA|SIERAKOWICE|KATOWICE|ZIELON\w*|DUBLIN|LODZ|ŁÓDŹ)\b\s*$/i, '')
  return s.replace(/[\s,.-]+$/, '').trim() || clean(raw)
}

const PEKAO_HEADER = 'Data księgowania;Data waluty;Nadawca / Odbiorca'

export function parsePekao(text: string): ParseResult {
  const rows = splitCsv(text)
  const out: ParsedRow[] = []
  for (const r of rows) {
    if (r.length < 12) continue
    const booked = isoFromDots(r[0])
    if (!booked) continue
    const amount = parseAmount(r[7])
    if (amount == null) continue

    const src = stripIban(r[4])
    const dst = stripIban(r[5])
    // Wiersz należy do rachunku, którego saldo się zmienia.
    const ownIban = amount < 0 ? src : (dst || src)
    if (!ownIban) continue

    const counterparty = clean(r[2])
    const address = clean(r[3])
    const description = clean(r[6])
    const reference = clean(r[9]).replace(/^'/, '')

    out.push({
      account_key: ownIban,
      account_name: `Rachunek ${ownIban.slice(-4)}`,
      bank: 'Pekao',
      booked_on: booked,
      value_on: isoFromDots(r[1]),
      amount,
      currency: clean(r[8]) || 'PLN',
      counterparty,
      counterparty_norm: normaliseMerchant(counterparty || description),
      description,
      address: address || null,
      src_iban: src || null,
      dst_iban: dst || null,
      bank_category: clean(r[11]),
      op_type: clean(r[10]) || null,
      reference: reference || null,
      haystack: buildHaystack([counterparty, address, description, clean(r[10])]),
      // Obie nogi przelewu wewnętrznego dzielą numer referencyjny — rozróżnia je konto.
      dedupe_key: `pekao:${hash([reference, ownIban, amount.toFixed(2), booked].join('|'))}`,
    })
  }
  return { format: 'pekao', rows: out }
}

export function parseMbank(text: string): ParseResult {
  const rows = splitCsv(text.replace(/^﻿/, ''))
  const out: ParsedRow[] = []
  const seen = new Map<string, number>()
  for (const r of rows) {
    if (r.length < 5) continue
    const booked = isoPlain(r[0])
    if (!booked) continue
    const amount = parseAmount(r[4])
    if (amount == null) continue
    const accLabel = clean(r[2])
    if (!accLabel || /^PL\b/.test(accLabel)) continue

    const rawDesc = clean(r[1])
    const pending = /nierozliczona/i.test(rawDesc)
    // Tekst stabilny między eksportami — bez znacznika "nierozliczona".
    const stable = rawDesc.replace(/\s*transakcja nierozliczona\s*/i, ' ').replace(/\s+/g, ' ').trim()
    const merchant = normaliseMerchant(stable.split(/\s{2,}/)[0] || stable)

    const base = `${booked}|${accLabel}|${amount.toFixed(2)}|${stable}`
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)

    out.push({
      account_key: accLabel,
      account_name: accLabel,
      bank: 'mBank',
      booked_on: booked,
      value_on: booked,
      amount,
      currency: 'PLN',
      counterparty: merchant,
      counterparty_norm: merchant,
      description: stable,
      address: null,
      src_iban: null,
      dst_iban: null,
      bank_category: clean(r[3]),
      op_type: pending ? 'NIEROZLICZONA' : null,
      reference: null,
      haystack: buildHaystack([stable, clean(r[3])]),
      dedupe_key: `mbank:${hash(`${base}#${n}`)}`,
    })
  }
  return { format: 'mbank', rows: out }
}

export function detectAndParse(text: string, filename: string): ParseResult {
  const head = text.slice(0, 4000)
  if (head.includes(PEKAO_HEADER)) return parsePekao(text)
  if (/mBank S\.A\./i.test(head) || head.includes('#Data operacji')) return parseMbank(text)
  throw new Error(`Nieznany format pliku: ${filename}`)
}

/** Stabilne id konta z jego klucza (IBAN lub etykiety). */
export function accountIdFor(key: string): string {
  const digits = key.replace(/\D/g, '')
  if (digits.length >= 16) return `acc_${digits.slice(-10)}`
  return `acc_${hash(key).slice(0, 10)}`
}

/** Heurystyka typu konta na podstawie etykiety z wyciągu. */
export function guessKind(label: string): string {
  const s = label.toUpperCase()
  if (/MASTERCARD|VISA|KARTA KREDYT/.test(s)) return 'credit_card'
  return 'personal'
}
