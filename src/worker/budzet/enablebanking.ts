/**
 * Klient Enable Banking (PSD2 AIS).
 *
 * Uwierzytelnianie to JWT RS256 podpisany kluczem prywatnym aplikacji —
 * podpisujemy przez WebCrypto, bo Workers nie mają node:crypto.
 * Klucz i identyfikator aplikacji są sekretami Workera, nigdy w repozytorium.
 */
const BASE = 'https://api.enablebanking.com'

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  // WebCrypto importuje wyłącznie PKCS#8 ("BEGIN PRIVATE KEY"). Klucz w starszym
  // formacie PKCS#1 trzeba przekonwertować, zanim trafi do sekretu Workera.
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new Error('Klucz jest w formacie PKCS#1. Przekonwertuj go: ' +
      'openssl pkcs8 -topk8 -nocrypt -in klucz.pem -out klucz-pkcs8.pem')
  }
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export async function signJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const data = `${enc({ typ: 'JWT', alg: 'RS256', kid: appId })}.${enc({
    iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600,
  })}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data))
  return `${data}.${b64url(sig)}`
}

export type EbConfig = { appId: string; privateKey: string }

export function ebConfig(env: { EB_APPLICATION_ID?: string; EB_PRIVATE_KEY?: string }): EbConfig | null {
  if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) return null
  return { appId: env.EB_APPLICATION_ID, privateKey: env.EB_PRIVATE_KEY }
}

/** Część banków (m.in. mBank) wymaga nagłówków identyfikujących końcowego
 *  użytkownika — bez nich zwracają błąd zarówno przy autoryzacji, jak i przy
 *  pobieraniu danych. */
export type PsuHeaders = { ip?: string; userAgent?: string }

async function call<T>(
  cfg: EbConfig, method: string, path: string, body?: unknown, psu?: PsuHeaders,
): Promise<T> {
  const jwt = await signJwt(cfg.appId, cfg.privateKey)
  const headers: Record<string, string> = {
    authorization: `Bearer ${jwt}`, 'content-type': 'application/json',
  }
  if (psu?.ip) headers['psu-ip-address'] = psu.ip
  if (psu?.userAgent) headers['psu-user-agent'] = psu.userAgent
  const res = await fetch(BASE + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Enable Banking ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : {}) as T
}

export type Aspsp = { name: string; country: string; logo?: string; maximum_consent_validity?: number }

export const listAspsps = (cfg: EbConfig, country: string) =>
  call<{ aspsps: Aspsp[] }>(cfg, 'GET', `/aspsps?country=${encodeURIComponent(country)}`)

export const startAuth = (cfg: EbConfig, p: {
  aspspName: string; country: string; redirectUrl: string; state: string
  validUntil: string; psu?: PsuHeaders; psuType?: 'personal' | 'business'
}) => call<{ url: string; authorization_id: string }>(cfg, 'POST', '/auth', {
  access: { valid_until: p.validUntil },
  aspsp: { name: p.aspspName, country: p.country },
  state: p.state,
  redirect_url: p.redirectUrl,
  psu_type: p.psuType ?? 'personal',
}, p.psu)

export type EbAccount = {
  uid: string
  account_id?: { iban?: string }
  name?: string
  product?: string
  currency?: string
}

export const createSession = (cfg: EbConfig, code: string, psu?: PsuHeaders) =>
  call<{ session_id: string; accounts: EbAccount[]; access?: { valid_until?: string }; aspsp?: Aspsp }>(
    cfg, 'POST', '/sessions', { code }, psu)

export const getSession = (cfg: EbConfig, sessionId: string, psu?: PsuHeaders) =>
  call<{ status: string; accounts: EbAccount[]; access?: { valid_until?: string } }>(
    cfg, 'GET', `/sessions/${sessionId}`, undefined, psu)

export type EbTransaction = {
  entry_reference?: string
  transaction_id?: string
  transaction_amount: { currency: string; amount: string }
  credit_debit_indicator: 'CRDT' | 'DBIT'
  status?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  creditor?: { name?: string }
  debtor?: { name?: string }
  creditor_account?: { iban?: string }
  debtor_account?: { iban?: string }
  remittance_information?: string[]
  bank_transaction_code?: { description?: string; code?: string; sub_code?: string }
  merchant_category_code?: string
  note?: string
}

export async function getTransactions(
  cfg: EbConfig, accountUid: string, dateFrom: string, psu?: PsuHeaders,
): Promise<EbTransaction[]> {
  const out: EbTransaction[] = []
  let key: string | undefined
  // Stronicowanie kluczem kontynuacji; limit stron chroni przed pętlą przy
  // nieoczekiwanej odpowiedzi banku.
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ date_from: dateFrom })
    if (key) q.set('continuation_key', key)
    const r = await call<{ transactions: EbTransaction[]; continuation_key?: string }>(
      cfg, 'GET', `/accounts/${accountUid}/transactions?${q}`, undefined, psu)
    out.push(...(r.transactions ?? []))
    if (!r.continuation_key) break
    key = r.continuation_key
  }
  return out
}

export const getBalances = (cfg: EbConfig, accountUid: string, psu?: PsuHeaders) =>
  call<{ balances: { name?: string; balance_amount: { amount: string; currency: string }; balance_type?: string }[] }>(
    cfg, 'GET', `/accounts/${accountUid}/balances`, undefined, psu)
