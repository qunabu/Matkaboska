import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, meal_plan_entries, recipes, products, food_log } from '../db/index'
import type { AppEnv } from '../types'
import type { MealPlanEntry, MealPlanEntryFull, MealType, PlanStatus, Ingredient, Macros, Recipe, PlanProduct } from '../../shared/types'

const app = new Hono<AppEnv>()

function toPlanProduct(p: typeof products.$inferSelect): PlanProduct {
  return { id: p.id, name: p.name, kcal: p.kcal, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g, serving_g: p.serving_g }
}

function parsePlanRow(
  row: typeof meal_plan_entries.$inferSelect,
  recipe?: typeof recipes.$inferSelect | null,
  product?: typeof products.$inferSelect | null,
): MealPlanEntry {
  const entry: MealPlanEntry = {
    id: row.id,
    date: row.date,
    meal_type: row.meal_type as MealPlanEntry['meal_type'],
    recipe_id: row.recipe_id,
    product_id: row.product_id,
    grams: row.grams,
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
  if (product) entry.product = toPlanProduct(product)
  return entry
}

// GET /api/plan?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/', async (c) => {
  const userId = c.var.userId
  const { from, to } = c.req.query()
  if (!from || !to) return c.json({ error: 'from and to required' }, 400)

  const db = getDb(c.env.DB)
  const rows = await db
    .select({ entry: meal_plan_entries, recipe: recipes, product: products })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .leftJoin(products, eq(meal_plan_entries.product_id, products.id))
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))
    .orderBy(meal_plan_entries.date, meal_plan_entries.meal_type)

  const items = rows.map(r => parsePlanRow(r.entry, r.recipe, r.product))
  return c.json({ items, total: items.length })
})

// GET /api/plan/print?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/print', async (c) => {
  const userId = c.var.userId
  const { from, to } = c.req.query()
  if (!from || !to) return c.json({ error: 'from and to required' }, 400)

  const db = getDb(c.env.DB)
  const rows = await db
    .select({ entry: meal_plan_entries, recipe: recipes, product: products })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .leftJoin(products, eq(meal_plan_entries.product_id, products.id))
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))
    .orderBy(meal_plan_entries.date, meal_plan_entries.meal_type)

  const items: MealPlanEntryFull[] = rows.map(r => ({
    id: r.entry.id,
    date: r.entry.date,
    meal_type: r.entry.meal_type as MealType,
    recipe_id: r.entry.recipe_id,
    product_id: r.entry.product_id,
    product: r.product ? toPlanProduct(r.product) : undefined,
    grams: r.entry.grams,
    servings: r.entry.servings,
    batch_group: r.entry.batch_group,
    is_leftover: r.entry.is_leftover,
    status: r.entry.status as PlanStatus,
    recipe: r.recipe ? {
      id: r.recipe.id,
      title: r.recipe.title,
      slug: r.recipe.slug,
      category: r.recipe.category as Recipe['category'],
      servings: r.recipe.servings,
      prep_minutes: r.recipe.prep_minutes,
      ingredients: JSON.parse(r.recipe.ingredients) as Ingredient[],
      steps: JSON.parse(r.recipe.steps) as string[],
      tags: JSON.parse(r.recipe.tags) as string[],
      is_seafood: r.recipe.is_seafood,
      source: r.recipe.source,
      macros: r.recipe.macros ? JSON.parse(r.recipe.macros) as Macros : null,
      macros_confidence: r.recipe.macros_confidence as Recipe['macros_confidence'],
      macros_assumptions: r.recipe.macros_assumptions,
      created_at: r.recipe.created_at,
      updated_at: r.recipe.updated_at,
    } as Recipe : undefined,
  }))

  return c.json({ items, total: items.length })
})

const PlanEntrySchema = z.object({
  recipe_id: z.number().int().nullable().optional(),
  product_id: z.number().int().nullable().optional(),
  grams: z.number().positive().nullable().optional(),
  servings: z.number().positive().default(1),
  batch_group: z.string().nullable().optional(),
  is_leftover: z.boolean().default(false),
  status: z.enum(['planned', 'eaten', 'skipped']).default('planned'),
})

// PUT /api/plan/:date/:meal_type
app.put('/:date/:meal_type', async (c) => {
  const userId = c.var.userId
  const date = c.req.param('date')
  const meal_type = c.req.param('meal_type')
  const body = await c.req.json()
  const parsed = PlanEntrySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)

  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.user_id, userId), eq(meal_plan_entries.date, date), eq(meal_plan_entries.meal_type, meal_type)))

  const [row] = await db.insert(meal_plan_entries).values({
    user_id: userId,
    date, meal_type,
    recipe_id: d.recipe_id ?? null,
    product_id: d.product_id ?? null,
    grams: d.grams ?? null,
    servings: d.servings,
    batch_group: d.batch_group ?? null,
    is_leftover: d.is_leftover,
    status: d.status,
  }).returning()

  let product = null
  if (row.product_id) { [product] = await db.select().from(products).where(eq(products.id, row.product_id)) }
  return c.json(parsePlanRow(row, null, product))
})

// PATCH /api/plan/:id/status
app.patch('/:id/status', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const { status } = z.object({ status: z.enum(['planned', 'eaten', 'skipped']) }).parse(await c.req.json())
  const db = getDb(c.env.DB)
  const [row] = await db.update(meal_plan_entries)
    .set({ status })
    .where(and(eq(meal_plan_entries.id, id), eq(meal_plan_entries.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)

  const tag = `plan:${id}`
  await db.delete(food_log).where(and(eq(food_log.portion, tag), eq(food_log.user_id, userId)))

  if (status === 'eaten' && row.recipe_id) {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, row.recipe_id))
    if (recipe?.macros) {
      const m = JSON.parse(recipe.macros) as Macros
      const mult = row.servings ?? 1
      await db.insert(food_log).values({
        user_id: userId,
        date: row.date,
        description: recipe.title,
        recipe_id: recipe.id,
        kcal: Math.round(m.kcal * mult),
        protein_g: Math.round(m.protein_g * mult * 10) / 10,
        carbs_g: Math.round(m.carbs_g * mult * 10) / 10,
        fat_g: Math.round(m.fat_g * mult * 10) / 10,
        portion: tag,
      })
    }
  } else if (status === 'eaten' && row.product_id) {
    const [product] = await db.select().from(products).where(eq(products.id, row.product_id))
    if (product) {
      const g = row.grams ?? product.serving_g ?? 100
      const f = g / 100
      await db.insert(food_log).values({
        user_id: userId,
        date: row.date,
        description: `${product.name} (${g} g)`,
        kcal: product.kcal != null ? Math.round(product.kcal * f) : null,
        protein_g: product.protein_g != null ? Math.round(product.protein_g * f * 10) / 10 : null,
        carbs_g: product.carbs_g != null ? Math.round(product.carbs_g * f * 10) / 10 : null,
        fat_g: product.fat_g != null ? Math.round(product.fat_g * f * 10) / 10 : null,
        portion: tag,
      })
    }
  }

  let product = null
  if (row.product_id) { [product] = await db.select().from(products).where(eq(products.id, row.product_id)) }
  return c.json(parsePlanRow(row, null, product))
})

// DELETE /api/plan/entry/:id
app.delete('/entry/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(food_log).where(and(eq(food_log.portion, `plan:${id}`), eq(food_log.user_id, userId)))
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.id, id), eq(meal_plan_entries.user_id, userId)))
  return c.json({ ok: true })
})

// DELETE /api/plan/:date/:meal_type
app.delete('/:date/:meal_type', async (c) => {
  const userId = c.var.userId
  const date = c.req.param('date')
  const meal_type = c.req.param('meal_type')
  const db = getDb(c.env.DB)
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.user_id, userId), eq(meal_plan_entries.date, date), eq(meal_plan_entries.meal_type, meal_type)))
  return c.json({ ok: true })
})

const ImportEntrySchema = z.object({
  date: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  recipe_id: z.number().int().nullable().optional(),
  product_id: z.number().int().nullable().optional(),
  grams: z.number().positive().nullable().optional(),
  servings: z.number().positive().default(1),
  batch_group: z.string().nullable().optional(),
  is_leftover: z.boolean().default(false),
  status: z.enum(['planned', 'eaten', 'skipped']).default('planned'),
})

// POST /api/plan/import
app.post('/import', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = z.object({ entries: z.array(ImportEntrySchema), replace: z.boolean().default(false) }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { entries, replace } = parsed.data
  const db = getDb(c.env.DB)

  if (replace && entries.length > 0) {
    const dates = [...new Set(entries.map(e => e.date))]
    for (const date of dates) {
      await db.delete(meal_plan_entries)
        .where(and(eq(meal_plan_entries.user_id, userId), eq(meal_plan_entries.date, date)))
    }
  }

  const inserted = []
  for (const e of entries) {
    const [row] = await db.insert(meal_plan_entries).values({
      user_id: userId,
      date: e.date,
      meal_type: e.meal_type,
      recipe_id: e.recipe_id ?? null,
      product_id: e.product_id ?? null,
      grams: e.grams ?? null,
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
