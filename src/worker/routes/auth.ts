import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { handleGoogleStart, handleGoogleCallback, readCookie, deleteSession, clearSessionCookie, googleEnabled } from '../lib/google-auth'
import { isAdmin } from './admin'

const app = new Hono<AppEnv>()

// GET /api/auth/google — redirect to Google's consent screen
app.get('/google', (c) => handleGoogleStart(new URL(c.req.url), c.env))

// GET /api/auth/google/callback — exchange code, set the session cookie
app.get('/google/callback', (c) => handleGoogleCallback(c.req.raw, new URL(c.req.url), c.env))

// GET /api/auth/me — current identity (userId set by the auth middleware)
app.get('/me', (c) => {
  const email = c.var.userId
  return c.json({ authed: !!email, email, googleEnabled: googleEnabled(c.env), isAdmin: isAdmin(c.env, email) })
})

// POST /api/auth/logout — drop the session
app.post('/logout', async (c) => {
  const token = readCookie(c.req.raw, 'sid')
  if (token) await deleteSession(c.env, token)
  c.header('set-cookie', clearSessionCookie())
  return c.json({ ok: true })
})

export { app as authRouter }
