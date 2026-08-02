import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, chores, push_subscriptions, notifications } from '../db/index'
import { localDateKey, appTimezone } from './habits'
import { sendPushNotification } from './push'
import type { AppEnv } from '../types'
import type { Db } from '../db/index'

const app = new Hono<AppEnv>()

const dayNum = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export interface ChoreTimeCtx { tz: string; todayKey: string; dow: number; nowMin: number }

export function choreDue(chore: typeof chores.$inferSelect, ctx: ChoreTimeCtx): { due: boolean; doneToday: boolean } {
  const lastKey = chore.last_done_at ? localDateKey(ctx.tz, new Date(chore.last_done_at * 1000)) : null
  const doneToday = lastKey === ctx.todayKey
  if (doneToday) return { due: false, doneToday: true }

  const [h, m] = chore.time.split(':').map(Number)
  const timeReached = ctx.nowMin >= (h * 60 + m)

  let scheduledToday: boolean
  if (chore.interval_days) {
    scheduledToday = !lastKey || dayNum(ctx.todayKey) - dayNum(lastKey) >= chore.interval_days
  } else {
    let wd: number[] = []
    try { wd = JSON.parse(chore.weekdays || '[]') } catch { /* none */ }
    scheduledToday = wd.includes(ctx.dow)
  }
  return { due: scheduledToday && timeReached, doneToday: false }
}

async function timeCtx(db: Db, userId: string): Promise<ChoreTimeCtx> {
  const tz = await appTimezone(db, userId)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    tz,
    todayKey: `${g('year')}-${g('month')}-${g('day')}`,
    dow: wdMap[g('weekday')] ?? 0,
    nowMin: Number(g('hour')) * 60 + Number(g('minute')),
  }
}

function toApi(row: typeof chores.$inferSelect, ctx: ChoreTimeCtx) {
  const { due, doneToday } = choreDue(row, ctx)
  return {
    id: row.id, name: row.name, interval_days: row.interval_days,
    weekdays: row.weekdays ? JSON.parse(row.weekdays) as number[] : null,
    time: row.time, nag_minutes: row.nag_minutes, active: row.active,
    last_done_at: row.last_done_at, due, done_today: doneToday,
  }
}

const bodySchema = z.object({
  name: z.string().min(1),
  interval_days: z.number().int().positive().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  nag_minutes: z.number().int().positive().optional(),
  active: z.boolean().optional(),
})

// GET /api/chores
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const ctx = await timeCtx(db, userId)
  const rows = await db.select().from(chores).where(eq(chores.user_id, userId)).orderBy(chores.created_at)
  return c.json({ items: rows.map((r) => toApi(r, ctx)), total: rows.length })
})

// POST /api/chores
app.post('/', async (c) => {
  const userId = c.var.userId
  const parsed = bodySchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const db = getDb(c.env.DB)
  const [row] = await db.insert(chores).values({
    user_id: userId,
    name: d.name.trim(),
    interval_days: d.interval_days ?? null,
    weekdays: d.weekdays ? JSON.stringify(d.weekdays) : null,
    time: d.time ?? '20:00',
    nag_minutes: d.nag_minutes ?? 60,
  }).returning()
  return c.json(toApi(row, await timeCtx(db, userId)), 201)
})

// PATCH /api/chores/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const parsed = bodySchema.partial().safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const set: Record<string, unknown> = {}
  if (d.name !== undefined) set.name = d.name.trim()
  if (d.interval_days !== undefined) set.interval_days = d.interval_days
  if (d.weekdays !== undefined) set.weekdays = d.weekdays ? JSON.stringify(d.weekdays) : null
  if (d.time !== undefined) set.time = d.time
  if (d.nag_minutes !== undefined) set.nag_minutes = d.nag_minutes
  if (d.active !== undefined) set.active = d.active
  const db = getDb(c.env.DB)
  const [row] = await db.update(chores).set(set)
    .where(and(eq(chores.id, id), eq(chores.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(toApi(row, await timeCtx(db, userId)))
})

// POST /api/chores/:id/done
app.post('/:id/done', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.update(chores)
    .set({ last_done_at: Math.floor(Date.now() / 1000), last_notified_at: null })
    .where(and(eq(chores.id, id), eq(chores.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(toApi(row, await timeCtx(db, userId)))
})

// POST /api/chores/:id/remind-now
app.post('/:id/remind-now', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(chores)
    .where(and(eq(chores.id, id), eq(chores.user_id, userId)))
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (!c.env.VAPID_PRIVATE_KEY) return c.json({ error: 'Push not configured' }, 503)
  const subs = await db.select().from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  if (subs.length === 0) return c.json({ error: 'No subscriptions', sent: 0, total: 0 }, 400)
  await db.insert(notifications).values({ user_id: userId, title: row.name, body: 'Czas na to zadanie ✅ — kliknij „Zrobione", gdy skończysz', url: '/chores', read_at: null }).catch(() => {})
  const results = await Promise.allSettled(
    subs.map((s) => sendPushNotification(c.env, s.endpoint, s.p256dh, s.auth, {
      title: row.name, body: 'Czas na to zadanie ✅ — kliknij „Zrobione", gdy skończysz', url: '/chores', tag: `chore-${row.id}`,
    }))
  )
  const sent = results.filter((r) => r.status === 'fulfilled').length
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String(r.reason))
  return c.json({ sent, total: subs.length, errors })
})

// DELETE /api/chores/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(chores).where(and(eq(chores.id, id), eq(chores.user_id, userId)))
  return c.json({ ok: true })
})

export { app as choresRouter }
