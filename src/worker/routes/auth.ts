import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, settings } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

export const AUTH_COOKIE = 'mbl_auth'

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Stable, unforgeable session token derived from the (server-only) PIN hash.
export async function sessionToken(pinHash: string): Promise<string> {
  return sha256hex('mbl-session:' + pinHash)
}

export async function getPinHash(env: Env): Promise<string | null> {
  const db = getDb(env.DB)
  const [row] = await db.select().from(settings).where(eq(settings.key, 'auth'))
  if (!row) return null
  try {
    return (JSON.parse(row.value) as { pinHash?: string }).pinHash ?? null
  } catch {
    return null
  }
}

// GET /api/auth/me — is the caller authenticated, and is a PIN set yet?
app.get('/me', async (c) => {
  const pinHash = await getPinHash(c.env)
  if (!pinHash) return c.json({ authed: false, needsSetup: true })
  const cookie = getCookie(c, AUTH_COOKIE)
  const authed = !!cookie && cookie === await sessionToken(pinHash)
  return c.json({ authed, needsSetup: false })
})

// POST /api/auth/login — first call sets the PIN; later calls verify it.
app.post('/login', async (c) => {
  const parsed = z.object({ pin: z.string().min(4).max(64) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'invalid_pin' }, 400)
  const pin = parsed.data.pin

  const db = getDb(c.env.DB)
  let pinHash = await getPinHash(c.env)
  if (!pinHash) {
    pinHash = await sha256hex(pin)
    await db.insert(settings).values({ key: 'auth', value: JSON.stringify({ pinHash }) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify({ pinHash }) } })
  } else if (await sha256hex(pin) !== pinHash) {
    return c.json({ error: 'bad_pin' }, 401)
  }

  setCookie(c, AUTH_COOKIE, await sessionToken(pinHash), {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 180,
  })
  return c.json({ ok: true })
})

// POST /api/auth/logout
app.post('/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

export { app as authRouter }
