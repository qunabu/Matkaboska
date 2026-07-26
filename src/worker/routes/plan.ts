import { Hono } from 'hono'
import { eq, and, between, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, meal_plan_entries, recipes } from '../db/index'
import type { Env } from '../types'
import type { MealPlanEntry, Ingredient, Macros } from '../../shared/types'

const app = new Hono<{ Bindings: Env }>()

function parsePlanRow(row: typeof meal_plan_entries.$inferSelect, recipe?: typeof recipes.$inferSelect | null): MealPlanEntry {
  const entry: MealPlanEntry = {
    id: row.id,
    date: row.date,
    meal_type: row.meal_type as MealPlanEntry['meal_type'],
    recipe_id: row.recipe_id,
    servings: row.servings,
    batch_group: row.batch_group,
    is_leftover: row.is_leftover,
    status: row.status as MealPlanEntry['status'],
  }
  if (recipe) {
    entry.recipe = {
      id: recipe.id,
      title: recipe.title,
      slug: recipe.slug,
      macros: recipe.macros ? JSON.parse(recipe.macros) as Macros : null,
      prep_minutes: recipe.prep_minutes,
    }
  }
  return entry
}

// GET /api/plan?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/', async (c) => {
  const { from, to } = c.req.query()
  if (!from || !to) return c.json({ error: 'from and to required' }, 400)

  const db = getDb(c.env.DB)
  const rows = await db
    .select({ entry: meal_plan_entries, recipe: recipes })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .where(between(meal_plan_entries.date, from, to))
    .orderBy(meal_plan_entries.date, meal_plan_entries.meal_type)

  const items = rows.map(r => parsePlanRow(r.entry, r.recipe))
  return c.json({ items, total: items.length })
})

const PlanEntrySchema = z.object({
  recipe_id: z.number().int().nullable().optional(),
  servings: z.number().positive().default(1),
  batch_group: z.string().nullable().optional(),
  is_leftover: z.boolean().default(false),
  status: z.enum(['planned', 'eaten', 'skipped']).default('planned'),
})

// PUT /api/plan/:date/:meal_type
app.put('/:date/:meal_type', async (c) => {
  const date = c.req.param('date')
  const meal_type = c.req.param('meal_type')
  const body = await c.req.json()
  const parsed = PlanEntrySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)

  // Upsert: delete existing then insert
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.date, date), eq(meal_plan_entries.meal_type, meal_type)))

  const [row] = await db.insert(meal_plan_entries).values({
    date, meal_type,
    recipe_id: d.recipe_id ?? null,
    servings: d.servings,
    batch_group: d.batch_group ?? null,
    is_leftover: d.is_leftover,
    status: d.status,
  }).returning()

  return c.json(parsePlanRow(row))
})

// PATCH /api/plan/:id/status
app.patch('/:id/status', async (c) => {
  const id = Number(c.req.param('id'))
  const { status } = z.object({ status: z.enum(['planned', 'eaten', 'skipped']) }).parse(await c.req.json())
  const db = getDb(c.env.DB)
  const [row] = await db.update(meal_plan_entries)
    .set({ status })
    .where(eq(meal_plan_entries.id, id))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(parsePlanRow(row))
})

// DELETE /api/plan/:date/:meal_type
app.delete('/:date/:meal_type', async (c) => {
  const date = c.req.param('date')
  const meal_type = c.req.param('meal_type')
  const db = getDb(c.env.DB)
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.date, date), eq(meal_plan_entries.meal_type, meal_type)))
  return c.json({ ok: true })
})

const ImportEntrySchema = z.object({
  date: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  recipe_id: z.number().int().nullable().optional(),
  servings: z.number().positive().default(1),
  batch_group: z.string().nullable().optional(),
  is_leftover: z.boolean().default(false),
  status: z.enum(['planned', 'eaten', 'skipped']).default('planned'),
})

// POST /api/plan/import  – bulk import (used by seed / plan import feature)
app.post('/import', async (c) => {
  const body = await c.req.json()
  const parsed = z.object({ entries: z.array(ImportEntrySchema), replace: z.boolean().default(false) }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { entries, replace } = parsed.data
  const db = getDb(c.env.DB)

  if (replace && entries.length > 0) {
    const dates = [...new Set(entries.map(e => e.date))]
    for (const date of dates) {
      await db.delete(meal_plan_entries).where(eq(meal_plan_entries.date, date))
    }
  }

  const inserted = []
  for (const e of entries) {
    const [row] = await db.insert(meal_plan_entries).values({
      date: e.date,
      meal_type: e.meal_type,
      recipe_id: e.recipe_id ?? null,
      servings: e.servings,
      batch_group: e.batch_group ?? null,
      is_leftover: e.is_leftover,
      status: e.status,
    }).returning()
    inserted.push(row)
  }

  return c.json({ inserted: inserted.length })
})

export { app as planRouter }
