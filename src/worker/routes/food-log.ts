import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, food_log, recipes } from '../db/index'
import type { Env } from '../types'
import type { Macros } from '../../shared/types'

const app = new Hono<{ Bindings: Env }>()

// GET /api/food-log?date=YYYY-MM-DD
app.get('/', async (c) => {
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const rows = await db.select().from(food_log)
    .where(eq(food_log.date, date))
    .orderBy(food_log.logged_at)
  return c.json({ items: rows, total: rows.length })
})

// GET /api/food-log/summary?date=YYYY-MM-DD
app.get('/summary', async (c) => {
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const rows = await db.select().from(food_log).where(eq(food_log.date, date))
  const summary = {
    date,
    kcal: sum(rows, 'kcal'),
    protein_g: sum(rows, 'protein_g'),
    carbs_g: sum(rows, 'carbs_g'),
    fat_g: sum(rows, 'fat_g'),
    entries: rows.length,
  }
  return c.json(summary)
})

// POST /api/food-log
app.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = z.object({
    date: z.string().optional(),
    description: z.string().nullable().optional(),
    recipe_id: z.number().int().nullable().optional(),
    kcal: z.number().nullable().optional(),
    protein_g: z.number().nullable().optional(),
    carbs_g: z.number().nullable().optional(),
    fat_g: z.number().nullable().optional(),
    portion: z.string().nullable().optional(),
    servings: z.number().positive().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)
  let kcal = d.kcal ?? null
  let protein_g = d.protein_g ?? null
  let carbs_g = d.carbs_g ?? null
  let fat_g = d.fat_g ?? null
  let description = d.description ?? null

  // Auto-fill macros from recipe if provided
  if (d.recipe_id && !d.kcal) {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, d.recipe_id))
    if (recipe?.macros) {
      const m = JSON.parse(recipe.macros) as Macros
      const mult = d.servings ?? 1
      kcal = Math.round(m.kcal * mult)
      protein_g = Math.round(m.protein_g * mult * 10) / 10
      carbs_g = Math.round(m.carbs_g * mult * 10) / 10
      fat_g = Math.round(m.fat_g * mult * 10) / 10
      description = description ?? recipe.title
    }
  }

  const [row] = await db.insert(food_log).values({
    date: d.date ?? todayDate(),
    description,
    recipe_id: d.recipe_id ?? null,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    portion: d.portion ?? null,
  }).returning()

  return c.json(row, 201)
})

// DELETE /api/food-log/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(food_log).where(eq(food_log.id, id))
  return c.json({ ok: true })
})

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
}

export { app as foodLogRouter }
