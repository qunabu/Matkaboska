import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, food_log, recipes } from '../db/index'
import type { AppEnv, Env } from '../types'
import type { Macros } from '../../shared/types'
import { resolveAnthropicKey } from './settings'

const app = new Hono<AppEnv>()

// GET /api/food-log?date=YYYY-MM-DD
app.get('/', async (c) => {
  const userId = c.var.userId
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const rows = await db.select().from(food_log)
    .where(and(eq(food_log.user_id, userId), eq(food_log.date, date)))
    .orderBy(food_log.logged_at)
  return c.json({ items: rows, total: rows.length })
})

// GET /api/food-log/summary?date=YYYY-MM-DD
app.get('/summary', async (c) => {
  const userId = c.var.userId
  const date = c.req.query('date') ?? todayDate()
  const db = getDb(c.env.DB)
  const rows = await db.select().from(food_log)
    .where(and(eq(food_log.user_id, userId), eq(food_log.date, date)))
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

// POST /api/food-log/estimate
app.post('/estimate', async (c) => {
  const userId = c.var.userId
  const parsed = z.object({
    description: z.string().min(1),
    date: z.string().optional(),
    portion: z.string().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { description, date, portion } = parsed.data

  const apiKey = await resolveAnthropicKey(c.env, userId)
  if (!apiKey) {
    return c.json({ error: 'needs_manual', message: 'Brak klucza API — wpisz makroskładniki ręcznie.' }, 422)
  }

  const macros = await estimateFoodMacros(c.env, apiKey, description)
  if (!macros) {
    return c.json({ error: 'needs_manual', message: 'Nie udało się oszacować — wpisz makroskładniki ręcznie.' }, 422)
  }

  const db = getDb(c.env.DB)
  const [row] = await db.insert(food_log).values({
    user_id: userId,
    date: date ?? todayDate(),
    description,
    recipe_id: null,
    kcal: Math.round(macros.kcal),
    protein_g: Math.round(macros.protein_g * 10) / 10,
    carbs_g: Math.round(macros.carbs_g * 10) / 10,
    fat_g: Math.round(macros.fat_g * 10) / 10,
    portion: portion ?? 'custom',
  }).returning()

  return c.json(row, 201)
})

async function estimateFoodMacros(env: Env, apiKey: string, description: string) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 200,
        system: 'You are a nutrition estimator. Estimate macros for the TOTAL portion the user describes (in Polish or English). Return ONLY valid JSON, no prose, no code fences.',
        messages: [{
          role: 'user',
          content: `Oszacuj makroskładniki dla zjedzonej porcji: "${description}".\nZwróć dokładnie ten JSON:\n{"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}`,
        }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json() as { content: Array<{ text: string }> }
    const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    const R = z.object({
      kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number(),
    })
    const result = R.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// POST /api/food-log
app.post('/', async (c) => {
  const userId = c.var.userId
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

  if (d.recipe_id && !d.kcal) {
    const [recipe] = await db.select().from(recipes)
      .where(and(eq(recipes.id, d.recipe_id), eq(recipes.user_id, userId)))
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
    user_id: userId,
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
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(food_log).where(and(eq(food_log.id, id), eq(food_log.user_id, userId)))
  return c.json({ ok: true })
})

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
}

export { app as foodLogRouter }
