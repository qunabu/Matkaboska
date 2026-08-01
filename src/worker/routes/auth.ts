import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

export const AUTH_COOKIE = 'mbl_auth'

// GET /api/auth/me — return the authenticated user's identity (from CF Access JWT)
app.get('/me', (c) => {
  const userId = c.var.userId
  return c.json({ authed: true, email: userId, needsSetup: false })
})

// POST /api/auth/logout — clear any legacy auth cookies
app.post('/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

export { app as authRouter }
