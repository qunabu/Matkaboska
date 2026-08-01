import { Hono } from 'hono'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, supplements, supplement_log, push_subscriptions } from '../db/index'
import { sendPushNotification } from './push'
import type { AppEnv } from '../types'
import type { Supplement, SupSchedule } from '../../shared/types'

const app = new Hono<AppEnv>()

function parseSupplement(row: typeof supplements.$inferSelect): Supplement {
  return {
    ...row,
    kind: row.kind as Supplement['kind'],
    schedule: JSON.parse(row.schedule) as SupSchedule,
  }
}

function countDuesToday(schedule: SupSchedule): number {
  const now = new Date()
  const dayOfWeek = now.getDay()
  if (!schedule.days.includes(dayOfWeek)) return 0
  return schedule.times.length
}

// GET /api/supplements
app.get('/', async (c) => {
  const userId = c.var.userId
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const rows = await db.select().from(supplements)
    .where(eq(supplements.user_id, userId))
    .orderBy(supplements.name)

  const suppIds = rows.map(r => r.id)
  const logs = suppIds.length
    ? await db.select().from(supplement_log)
        .where(and(eq(supplement_log.date, date), inArray(supplement_log.supplement_id, suppIds)))
    : []

  const items = rows.map(row => {
    const supp = parseSupplement(row)
    const takenToday = logs.filter(l => l.supplement_id === row.id).length
    const schedule = supp.schedule
    const dueToday = countDuesToday(schedule)
    return { ...supp, taken_today: takenToday, doses_due: dueToday }
  })

  return c.json({ items, total: items.length })
})

// GET /api/supplements/log?date=
app.get('/log', async (c) => {
  const userId = c.var.userId
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const userSupps = await db.select({ id: supplements.id }).from(supplements)
    .where(eq(supplements.user_id, userId))
  const suppIds = userSupps.map(s => s.id)
  if (suppIds.length === 0) return c.json({ items: [], total: 0 })
  const rows = await db.select().from(supplement_log)
    .where(and(eq(supplement_log.date, date), inArray(supplement_log.supplement_id, suppIds)))
  return c.json({ items: rows, total: rows.length })
})

// DELETE /api/supplements/log/:logId
app.delete('/log/:logId', async (c) => {
  const id = Number(c.req.param('logId'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  // Verify the log belongs to one of the user's supplements
  const [log] = await db.select().from(supplement_log).where(eq(supplement_log.id, id))
  if (log) {
    const [sup] = await db.select({ id: supplements.id }).from(supplements)
      .where(and(eq(supplements.id, log.supplement_id), eq(supplements.user_id, userId)))
    if (!sup) return c.json({ error: 'Not found' }, 404)
  }
  await db.delete(supplement_log).where(eq(supplement_log.id, id))
  return c.json({ ok: true })
})

// GET /api/supplements/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(supplements)
    .where(and(eq(supplements.id, id), eq(supplements.user_id, userId)))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(parseSupplement(row))
})

const ScheduleSchema = z.object({
  times: z.array(z.string()),
  days: z.array(z.number().int().min(0).max(6)),
})

const SuppBodySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['supplement', 'medication']),
  dose: z.string().nullable().optional(),
  schedule: ScheduleSchema.default({ times: [], days: [0, 1, 2, 3, 4, 5, 6] }),
  notes: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

// POST /api/supplements
app.post('/', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = SuppBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const db = getDb(c.env.DB)
  const [row] = await db.insert(supplements).values({
    user_id: userId,
    name: d.name,
    kind: d.kind,
    dose: d.dose ?? null,
    notes: d.notes ?? null,
    schedule: JSON.stringify(d.schedule),
    active: d.active,
  }).returning()
  return c.json(parseSupplement(row), 201)
})

// PATCH /api/supplements/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = SuppBodySchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (d.name !== undefined) updates.name = d.name
  if (d.kind !== undefined) updates.kind = d.kind
  if (d.dose !== undefined) updates.dose = d.dose
  if (d.schedule !== undefined) updates.schedule = JSON.stringify(d.schedule)
  if (d.notes !== undefined) updates.notes = d.notes
  if (d.active !== undefined) updates.active = d.active

  const [row] = await db.update(supplements).set(updates)
    .where(and(eq(supplements.id, id), eq(supplements.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(parseSupplement(row))
})

// DELETE /api/supplements/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(supplements).where(and(eq(supplements.id, id), eq(supplements.user_id, userId)))
  return c.json({ ok: true })
})

// POST /api/supplements/:id/log
app.post('/:id/log', async (c) => {
  const supplement_id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [sup] = await db.select({ id: supplements.id }).from(supplements)
    .where(and(eq(supplements.id, supplement_id), eq(supplements.user_id, userId)))
  if (!sup) return c.json({ error: 'Not found' }, 404)
  const [row] = await db.insert(supplement_log).values({
    supplement_id,
    date: todayDate(),
  }).returning()
  return c.json(row, 201)
})

// POST /api/supplements/:id/remind-now
app.post('/:id/remind-now', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [sup] = await db.select().from(supplements)
    .where(and(eq(supplements.id, id), eq(supplements.user_id, userId)))
  if (!sup) return c.json({ error: 'Not found' }, 404)
  if (!c.env.VAPID_PRIVATE_KEY) return c.json({ error: 'Push not configured' }, 503)
  const subs = await db.select().from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  if (subs.length === 0) return c.json({ error: 'No subscriptions', sent: 0, total: 0 }, 400)
  const results = await Promise.allSettled(
    subs.map((s) => sendPushNotification(c.env, s.endpoint, s.p256dh, s.auth, {
      title: sup.name,
      body: sup.kind === 'medication'
        ? 'Czas na lek 💊 — kliknij „Przyjmij", gdy weźmiesz'
        : 'Czas na suplement 💊 — kliknij „Przyjmij", gdy weźmiesz',
      url: '/supplements',
      tag: `sup-${sup.id}`,
    }))
  )
  const sent = results.filter((r) => r.status === 'fulfilled').length
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String(r.reason))
  return c.json({ sent, total: subs.length, errors })
})

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export { app as supplementsRouter }
