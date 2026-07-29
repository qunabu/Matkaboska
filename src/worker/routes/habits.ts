import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, habits, habit_checkins, settings } from '../db/index'
import type { Env } from '../types'
import type { Db } from '../db/index'

const app = new Hono<{ Bindings: Env }>()

// Local YYYY-MM-DD in the app timezone (habit "days" are local days).
export function localDateKey(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export async function appTimezone(db: Db): Promise<string> {
  try {
    const [s] = await db.select().from(settings).where(eq(settings.key, 'app'))
    if (s) { const v = JSON.parse(s.value) as { timezone?: string }; if (v.timezone) return v.timezone }
  } catch { /* default */ }
  return 'Europe/Warsaw'
}

// Current streak + today's status from a habit's check-ins. A missed (unanswered)
// past day breaks the streak; today being unanswered does not.
export function habitState(
  checkins: { date: string; success: boolean }[],
  todayKey: string,
): { streak: number; today: 'yes' | 'no' | null } {
  const map = new Map(checkins.map((c) => [c.date, c.success]))
  const today = map.has(todayKey) ? (map.get(todayKey) ? 'yes' : 'no') : null

  let streak = 0
  const d = new Date(todayKey + 'T00:00:00Z')
  for (let i = 0; i < 3660; i++) {
    const key = d.toISOString().slice(0, 10)
    const val = map.get(key)
    if (val === true) streak++
    else if (val === false) break
    else if (key !== todayKey) break // an earlier unanswered day breaks the streak
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return { streak, today }
}

export async function getHabitState(db: Db, habitId: number, todayKey: string) {
  const rows = await db.select().from(habit_checkins).where(eq(habit_checkins.habit_id, habitId))
  return habitState(rows.map((r) => ({ date: r.date, success: r.success })), todayKey)
}

// GET /api/habits
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const tz = await appTimezone(db)
  const todayKey = localDateKey(tz)
  const rows = await db.select().from(habits).orderBy(habits.created_at)
  const checkins = await db.select().from(habit_checkins)
  const byHabit = new Map<number, { date: string; success: boolean }[]>()
  for (const ci of checkins) {
    const arr = byHabit.get(ci.habit_id) ?? []
    arr.push({ date: ci.date, success: ci.success })
    byHabit.set(ci.habit_id, arr)
  }
  const items = rows.map((h) => {
    const st = habitState(byHabit.get(h.id) ?? [], todayKey)
    return { id: h.id, name: h.name, active: h.active, created_at: h.created_at, ...st }
  })
  return c.json({ items, total: items.length })
})

// POST /api/habits  { name }
app.post('/', async (c) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.insert(habits).values({ name: parsed.data.name.trim() }).returning()
  return c.json(row, 201)
})

// PATCH /api/habits/:id  { name?, active? }
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(habits).set(parsed.data).where(eq(habits.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// POST /api/habits/:id/checkin  { success }  — records today's answer (local day)
app.post('/:id/checkin', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({ success: z.boolean() }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const tz = await appTimezone(db)
  const todayKey = localDateKey(tz)
  await db.insert(habit_checkins).values({ habit_id: id, date: todayKey, success: parsed.data.success })
    .onConflictDoUpdate({ target: [habit_checkins.habit_id, habit_checkins.date], set: { success: parsed.data.success } })
  const st = await getHabitState(db, id, todayKey)
  return c.json({ ok: true, ...st })
})

// DELETE /api/habits/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(habit_checkins).where(eq(habit_checkins.habit_id, id))
  await db.delete(habits).where(eq(habits.id, id))
  return c.json({ ok: true })
})

export { app as habitsRouter }
