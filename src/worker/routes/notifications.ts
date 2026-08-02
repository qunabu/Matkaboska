import { Hono } from 'hono'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { getDb, notifications } from '../db/index'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

// GET /api/notifications — latest 50 + unread count.
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const items = await db.select().from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(50)
  const unread = items.filter((n) => n.read_at == null).length
  return c.json({ items, unread })
})

// POST /api/notifications/read-all — mark every unread notification read.
app.post('/read-all', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.update(notifications).set({ read_at: Math.floor(Date.now() / 1000) })
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)))
  return c.json({ ok: true })
})

// POST /api/notifications/:id/read — mark one read.
app.post('/:id/read', async (c) => {
  const userId = c.var.userId
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.update(notifications).set({ read_at: Math.floor(Date.now() / 1000) })
    .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))
  return c.json({ ok: true })
})

export { app as notificationsRouter }
