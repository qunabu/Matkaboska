import { Hono } from 'hono'
import { eq, and, desc, isNotNull, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, food_log, recipes, water_log } from '../db/index'
import type { AppEnv, Env } from '../types'
import type { Macros, FoodSuggestion, AverageWindow, FoodLogAverages } from '../../shared/types'
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
    iron_mg: Math.round(sum(rows, 'iron_mg') * 10) / 10,
    entries: rows.length,
  }
  return c.json(summary)
})

// GET /api/food-log/averages?today=YYYY-MM-DD
// Daily averages over two windows: last 30 days and everything ever logged.
// Days without a single entry are skipped (they would fake a "bad" average) and
// so is today, because a half-eaten day makes every number look worse. The same
// goes per number: a day logged without macros (a note like "kawa u mamy") is no
// evidence of a zero-protein day, so it only counts towards the numbers it
// actually carries.
app.get('/averages', async (c) => {
  const userId = c.var.userId
  const today = c.req.query('today') ?? todayDate()
  const monthStart = addDays(today, -30) // 30 full days: today-30 … today-1
  const db = getDb(c.env.DB)

  // count(col) counts non-null values only — that is what tells a filled-in zero
  // apart from a missing number.
  const foodDays = await db.select({
    date: food_log.date,
    kcal: sql<number>`sum(coalesce(${food_log.kcal}, 0))`,
    protein_g: sql<number>`sum(coalesce(${food_log.protein_g}, 0))`,
    carbs_g: sql<number>`sum(coalesce(${food_log.carbs_g}, 0))`,
    fat_g: sql<number>`sum(coalesce(${food_log.fat_g}, 0))`,
    iron_mg: sql<number>`sum(coalesce(${food_log.iron_mg}, 0))`,
    n_kcal: sql<number>`count(${food_log.kcal})`,
    n_protein_g: sql<number>`count(${food_log.protein_g})`,
    n_carbs_g: sql<number>`count(${food_log.carbs_g})`,
    n_fat_g: sql<number>`count(${food_log.fat_g})`,
    n_iron_mg: sql<number>`count(${food_log.iron_mg})`,
    entries: sql<number>`count(*)`,
  }).from(food_log)
    .where(and(eq(food_log.user_id, userId), lt(food_log.date, today)))
    .groupBy(food_log.date)

  const waterDays = await db.select({ date: water_log.date, glasses: water_log.glasses })
    .from(water_log)
    .where(and(eq(water_log.user_id, userId), lt(water_log.date, today)))

  type FoodDay = typeof foodDays[number]

  const window = (from?: string): AverageWindow => {
    const fd = from ? foodDays.filter((d) => d.date >= from) : foodDays
    const wd = (from ? waterDays.filter((d) => d.date >= from) : waterDays).filter((d) => d.glasses > 0)
    const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

    // Mean of one macro over the days that have it logged, plus how many days
    // that was — the UI shows it, so a number never hides how thin it is.
    const macro = (key: keyof FoodDay, count: keyof FoodDay, dp = 1) => {
      const days = fd.filter((d) => Number(d[count]) > 0)
      const total = days.reduce((a, d) => a + (Number(d[key]) || 0), 0)
      return { value: days.length ? round(total / days.length, dp) : 0, days: days.length }
    }

    const kcal = macro('kcal', 'n_kcal', 0)
    const protein_g = macro('protein_g', 'n_protein_g')
    const carbs_g = macro('carbs_g', 'n_carbs_g')
    const fat_g = macro('fat_g', 'n_fat_g')
    const iron_mg = macro('iron_mg', 'n_iron_mg')
    const glasses = wd.length ? round(wd.reduce((a, d) => a + d.glasses, 0) / wd.length, 1) : 0

    return {
      days: fd.length,
      water_days: wd.length,
      kcal: kcal.value,
      protein_g: protein_g.value,
      carbs_g: carbs_g.value,
      fat_g: fat_g.value,
      iron_mg: iron_mg.value,
      glasses,
      entries: fd.reduce((a, d) => a + (Number(d.entries) || 0), 0),
      first_date: fd.reduce<string | null>((min, d) => (min == null || d.date < min ? d.date : min), null),
      metric_days: {
        kcal: kcal.days,
        protein_g: protein_g.days,
        carbs_g: carbs_g.days,
        fat_g: fat_g.days,
        iron_mg: iron_mg.days,
        glasses: wd.length,
      },
    }
  }

  return c.json({ month: window(monthStart), all: window() } satisfies FoodLogAverages)
})

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// GET /api/food-log/suggestions?q=kanapka
// Autocomplete for the "what did you eat" field: previously logged entries first
// (they already carry macros, so picking one skips the AI estimate), then dishes
// from the recipe book.
app.get('/suggestions', async (c) => {
  const userId = c.var.userId
  const q = fold(c.req.query('q') ?? '')
  const db = getDb(c.env.DB)

  // Matching happens in JS: SQLite's LIKE/lower() only fold ASCII, so "zurek"
  // would never find "Żurek".
  const logRows = await db.select().from(food_log)
    .where(and(eq(food_log.user_id, userId), isNotNull(food_log.description)))
    .orderBy(desc(food_log.logged_at))
    .limit(500)

  const seen = new Set<string>()
  const past: FoodSuggestion[] = []
  for (const r of logRows) {
    const label = (r.description ?? '').trim()
    if (!label) continue
    const key = fold(label)
    if (seen.has(key)) continue
    seen.add(key)
    if (q && !key.includes(q)) continue
    past.push({
      source: 'log',
      label,
      recipe_id: null,
      kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, iron_mg: r.iron_mg,
      portion: r.portion,
      category: null,
    })
    if (past.length >= 8) break
  }

  const recipeRows = await db.select({
    id: recipes.id, title: recipes.title, macros: recipes.macros, category: recipes.category,
  }).from(recipes)
    .where(eq(recipes.user_id, userId))
    .orderBy(recipes.title)

  const fromRecipes: FoodSuggestion[] = []
  for (const r of recipeRows) {
    const key = fold(r.title)
    if (seen.has(key)) continue
    if (q && !key.includes(q)) continue
    const m = r.macros ? JSON.parse(r.macros) as Macros : null
    fromRecipes.push({
      source: 'recipe',
      label: r.title,
      recipe_id: r.id,
      // Recipe macros are stored per serving.
      kcal: m?.kcal ?? null,
      protein_g: m?.protein_g ?? null,
      carbs_g: m?.carbs_g ?? null,
      fat_g: m?.fat_g ?? null,
      iron_mg: m?.iron_mg ?? null,
      portion: 'recipe',
      category: r.category,
    })
    if (fromRecipes.length >= 12) break
  }

  const items = [...past, ...fromRecipes]
  return c.json({ items, total: items.length })
})

// Lowercase + strip Polish diacritics so "zurek" matches "Żurek".
function fold(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l')
}

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
    iron_mg: Math.round(macros.iron_mg * 10) / 10,
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
          content: `Oszacuj makroskładniki dla zjedzonej porcji: "${description}".\nZwróć dokładnie ten JSON (iron_mg = żelazo w mg):\n{"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"iron_mg":0}`,
        }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json() as { content: Array<{ text: string }> }
    const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    const R = z.object({
      kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number(),
      iron_mg: z.number().catch(0), // older prompts / stubborn models omit it
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
    iron_mg: z.number().nullable().optional(),
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
  let iron_mg = d.iron_mg ?? null
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
      iron_mg = Math.round((m.iron_mg ?? 0) * mult * 10) / 10
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
    iron_mg,
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
