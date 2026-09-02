import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { googleEnabled, readCookie, sessionEmail } from '../lib/google-auth'
import { getDb, block_devices } from '../db/index'
import type { AppEnv, Env } from '../types'

// A device bearer token (see /api/blocks/devices) stands in for a session on
// hardware that can't run the Google sign-in flow — currently the Android
// blocker. Returns the owning userId, or '' when the token is unknown.
async function deviceUserId(env: Env, authorization: string | undefined): Promise<string> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return ''
  const db = getDb(env.DB)
  const [row] = await db.select().from(block_devices).where(eq(block_devices.token, token))
  if (!row) return ''
  // The phone polls every few minutes; a rough "last seen" is enough, so don't
  // spend a write on every single request.
  const now = Math.floor(Date.now() / 1000)
  if (!row.last_seen_at || now - row.last_seen_at > 60) {
    await db.update(block_devices).set({ last_seen_at: now }).where(eq(block_devices.id, row.id))
  }
  return row.user_id
}

// Endpoints reachable without a session: login flow, health, and shared lists.
// A shared-list link (/api/s/<token>) is a public capability URL — the token is
// the secret — so the recipient can open it without signing in.
function isPublic(path: string): boolean {
  return (
    path.startsWith('/api/auth/') ||
    path === '/api/version' ||
    path === '/api/health' ||
    path.startsWith('/api/s/')
  )
}

// A device token is a phone-shaped key, not a login: it may read its own block
// rules and tick habits off, and nothing else. Losing the phone must not expose
// the budget, recipes or anything else on the account.
function deviceAllowed(method: string, path: string): boolean {
  if (method === 'GET' && (path === '/api/blocks' || path === '/api/habits')) return true
  if (method === 'POST' && /^\/api\/habits\/\d+\/checkin$/.test(path)) return true
  return false
}

// Resolve the tenant (userId = Google email) from the session cookie, or fall
// back to DEV_USER_EMAIL when Google OAuth isn't configured (local dev).
// Protected endpoints require a session; public ones pass through.
export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname
  let userId = ''
  let authKind: 'session' | 'device' | 'none' = 'none'
  if (!googleEnabled(c.env)) {
    userId = c.env.DEV_USER_EMAIL || 'dev@localhost'
    authKind = 'session'
  } else {
    const token = readCookie(c.req.raw, 'sid')
    if (token) userId = (await sessionEmail(c.env, token)) || ''
    if (userId) {
      authKind = 'session'
    } else {
      userId = await deviceUserId(c.env, c.req.header('authorization'))
      if (userId) authKind = 'device'
    }
  }
  c.set('userId', userId)
  c.set('authKind', authKind)
  if (!userId && !isPublic(path)) return c.json({ error: 'unauthorized' }, 401)
  if (authKind === 'device' && !deviceAllowed(c.req.method, path)) {
    return c.json({ error: 'device tokens may only read rules and check habits in' }, 403)
  }
  return next()
})
