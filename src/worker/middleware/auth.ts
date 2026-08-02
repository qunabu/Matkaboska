import { createMiddleware } from 'hono/factory'
import { googleEnabled, readCookie, sessionEmail } from '../lib/google-auth'
import type { AppEnv } from '../types'

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

// Resolve the tenant (userId = Google email) from the session cookie, or fall
// back to DEV_USER_EMAIL when Google OAuth isn't configured (local dev).
// Protected endpoints require a session; public ones pass through.
export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname
  let userId = ''
  if (!googleEnabled(c.env)) {
    userId = c.env.DEV_USER_EMAIL || 'dev@localhost'
  } else {
    const token = readCookie(c.req.raw, 'sid')
    if (token) userId = (await sessionEmail(c.env, token)) || ''
  }
  c.set('userId', userId)
  if (!userId && !isPublic(path)) return c.json({ error: 'unauthorized' }, 401)
  return next()
})
