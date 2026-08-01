// Self-hosted Google OAuth (OIDC authorization-code flow), ported from the
// garaz app. No Cloudflare Access. The user's email is the tenant id (userId).
// Sessions live in D1 (strongly consistent). The id_token signature is not
// re-verified because the token comes straight from Google's token endpoint
// over TLS, authenticated by our client_secret (OIDC 3.1.3.7); we validate
// iss / aud / nonce / exp / email_verified.
import { eq, lt } from 'drizzle-orm'
import { getDb, sessions } from '../db/index'
import type { Env } from '../types'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const OAUTH_PATH = '/api/auth/google'
const SESSION_DAYS = 30

export const googleEnabled = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

const sessionCookie = (token: string, maxAge: number) =>
  `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
export const clearSessionCookie = () => sessionCookie('', 0)
const oauthCookie = (value: string, maxAge: number) =>
  `oauth=${value}; HttpOnly; Secure; SameSite=Lax; Path=${OAUTH_PATH}; Max-Age=${maxAge}`

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = String(jwt).split('.')[1] ?? ''
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

// Who may sign in. Both lists empty → any Google account (self-service tenants).
function emailAllowed(env: Env, email: string): boolean {
  const domains = String(env.ALLOWED_GOOGLE_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
  const emails = String(env.ALLOWED_GOOGLE_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (domains.length === 0 && emails.length === 0) return true
  if (emails.includes(email)) return true
  return domains.includes(email.split('@')[1] ?? '')
}

export async function createSession(env: Env, email: string): Promise<string> {
  const db = getDb(env.DB)
  const token = randomHex(32)
  const now = Math.floor(Date.now() / 1000)
  await db.insert(sessions).values({ token, user_id: email, expires_at: now + SESSION_DAYS * 86400 })
  await db.delete(sessions).where(lt(sessions.expires_at, now))
  return sessionCookie(token, SESSION_DAYS * 86400)
}

export async function sessionEmail(env: Env, token: string): Promise<string | null> {
  const db = getDb(env.DB)
  const [row] = await db.select().from(sessions).where(eq(sessions.token, token))
  if (!row) return null
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.token, token))
    return null
  }
  return row.user_id
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  const db = getDb(env.DB)
  await db.delete(sessions).where(eq(sessions.token, token))
}

const backToLogin = (message?: string) =>
  new Response(null, {
    status: 302,
    headers: { location: message ? `/?error=${encodeURIComponent(message)}` : '/', 'set-cookie': oauthCookie('', 0) },
  })

export function handleGoogleStart(url: URL, env: Env): Response {
  if (!googleEnabled(env)) return new Response('Google login not configured', { status: 501 })
  const state = randomHex(16)
  const nonce = randomHex(16)
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${url.origin}${OAUTH_PATH}/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state, nonce,
    access_type: 'online',
    prompt: 'select_account',
  })
  if (env.GOOGLE_HD) params.set('hd', env.GOOGLE_HD)
  return new Response(null, {
    status: 302,
    headers: { location: `${GOOGLE_AUTH_URL}?${params}`, 'set-cookie': oauthCookie(`${state}.${nonce}`, 600) },
  })
}

export async function handleGoogleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  if (!googleEnabled(env)) return backToLogin('Logowanie Google nie jest skonfigurowane.')
  if (url.searchParams.get('error')) return backToLogin('Logowanie Google zostało anulowane.')

  const [state, nonce] = (readCookie(request, 'oauth') ?? '').split('.')
  const code = url.searchParams.get('code')
  if (!code || !state || !safeEqual(state, url.searchParams.get('state') ?? ''))
    return backToLogin('Sesja logowania wygasła. Spróbuj ponownie.')

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${url.origin}${OAUTH_PATH}/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string }
  if (!res.ok || !tokens.id_token) return backToLogin('Google odrzucił logowanie.')

  let claims: Record<string, unknown>
  try { claims = decodeJwtPayload(tokens.id_token) } catch { return backToLogin('Nieprawidłowa odpowiedź Google.') }

  const now = Math.floor(Date.now() / 1000)
  const audOk = claims.aud === env.GOOGLE_CLIENT_ID
  const issOk = GOOGLE_ISSUERS.includes(claims.iss as string)
  const nonceOk = typeof claims.nonce === 'string' && safeEqual(claims.nonce, nonce ?? '')
  const exp = typeof claims.exp === 'number' ? claims.exp : 0
  if (!audOk || !issOk || !nonceOk || exp < now) return backToLogin('Nie udało się zweryfikować tożsamości Google.')
  if (!claims.email || claims.email_verified === false) return backToLogin('Konto Google nie ma potwierdzonego adresu e-mail.')

  const email = normEmail(claims.email)
  if (!emailAllowed(env, email)) return backToLogin('To konto nie ma dostępu do aplikacji.')

  const headers = new Headers({ location: '/' })
  headers.append('set-cookie', oauthCookie('', 0))
  headers.append('set-cookie', await createSession(env, email))
  return new Response(null, { status: 302, headers })
}
