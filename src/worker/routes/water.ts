import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, water_log } from '../db/index'
import { getSettings } from './settings'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

// GET /api/water?date=YYYY-MM-DD
app.get('/', async (c) => {
  const userId = c.var.userId
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(water_log)
    .where(and(eq(water_log.user_id, userId), eq(water_log.date, date)))
  if (row) return c.json(row)

  const s = await getSettings(c.env, userId)
  return c.json({ id: null, date, glasses: 0, target_glasses: s.water_glasses_target })
})

// PUT /api/water/:date  — upsert; body: { glasses } or { delta: +1/-1 }
app.put('/:date', async (c) => {
  const userId = c.var.userId
  const date = c.req.param('date')
  const body = await c.req.json()
  const parsed = z.object({
    glasses: z.number().int().min(0).optional(),
    delta: z.number().int().optional(),
    target_glasses: z.number().int().positive().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)
  const [existing] = await db.select().from(water_log)
    .where(and(eq(water_log.user_id, userId), eq(water_log.date, date)))
  const s = await getSettings(c.env, userId)
  const target = d.target_glasses ?? existing?.target_glasses ?? s.water_glasses_target

  let glasses: number
  if (d.glasses !== undefined) {
    glasses = d.glasses
  } else if (d.delta !== undefined) {
    glasses = Math.max(0, (existing?.glasses ?? 0) + d.delta)
  } else {
    return c.json({ error: 'glasses or delta required' }, 400)
  }

  const [row] = await db.insert(water_log)
    .values({ user_id: userId, date, glasses, target_glasses: target })
    .onConflictDoUpdate({
      target: [water_log.user_id, water_log.date],
      set: { glasses, target_glasses: target },
    })
    .returning()
  return c.json(row)
})

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export { app as waterRouter }
