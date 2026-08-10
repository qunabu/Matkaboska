import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, meal_plan_entries, recipes, products, food_log, settings } from '../db/index'
import type { AppEnv, Env } from '../types'
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
// Full weekly plan (entries + recipe + product) for a user and date range.
// Shared by the authed /print route and the public shared-plan endpoint.
export async function loadFullPlan(env: Env, userId: string, from: string, to: string): Promise<MealPlanEntryFull[]> {
  const db = getDb(env.DB)
  const rows = await db
    .select({ entry: meal_plan_entries, recipe: recipes, product: products })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .leftJoin(products, eq(meal_plan_entries.product_id, products.id))
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))
    .orderBy(meal_plan_entries.date, meal_plan_entries.meal_type)

  return rows.map(r => ({
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
}

app.get('/print', async (c) => {
  const { from, to } = c.req.query()
  if (!from || !to) return c.json({ error: 'from and to required' }, 400)
  const items = await loadFullPlan(c.env, c.var.userId, from, to)
  return c.json({ items, total: items.length })
})

// GET /api/plan/share-token — a stable per-user token for read-only plan sharing.
app.get('/share-token', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.user_id, userId), eq(settings.key, 'plan_share_token')))
  if (row?.value) return c.json({ token: row.value })
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes)
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  await db.insert(settings).values({ user_id: userId, key: 'plan_share_token', value: token })
    .onConflictDoUpdate({ target: [settings.user_id, settings.key], set: { value: token } })
  return c.json({ token })
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

// Which recipe categories are eligible for each meal slot.
const SLOT_CATEGORIES: Record<string, string[]> = {
  breakfast: ['breakfast', 'smoothie'],
  lunch: ['lunch', 'soup', 'salad', 'other'],
  dinner: ['dinner', 'soup', 'salad', 'other'],
  snack: ['snack', 'dessert', 'smoothie'],
}
const GEN_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

// Lunch and dinner draw from the same kind of dishes, so they share one weekly
// counter — a recipe used as obiad twice can't come back as kolacja.
const USAGE_BUCKET: Record<MealType, string> = {
  breakfast: 'breakfast',
  lunch: 'main',
  dinner: 'main',
  snack: 'snack',
}
// How many times one recipe may appear in a week within its bucket.
const MAX_WEEKLY_REPEATS = 2

function addDaysStr(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The subset of items with the lowest usage count.
function leastUsed<T>(items: T[], count: (item: T) => number): T[] {
  if (items.length === 0) return items
  const min = Math.min(...items.map(count))
  return items.filter((item) => count(item) === min)
}

// POST /api/plan/generate-week — fill a whole week from the user's own recipes,
// matching each meal slot to sensible categories and keeping any one dish to at
// most MAX_WEEKLY_REPEATS appearances per week.
app.post('/generate-week', async (c) => {
  const userId = c.var.userId
  const parsed = z.object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { weekStart } = parsed.data
  const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i))

  const db = getDb(c.env.DB)
  const all = await db.select({ id: recipes.id, category: recipes.category })
    .from(recipes).where(eq(recipes.user_id, userId))
  if (all.length === 0) {
    return c.json({ error: 'no_recipes', message: 'Brak przepisów — dodaj je najpierw.' }, 422)
  }

  const pool = (slot: MealType) => {
    const cats = SLOT_CATEGORIES[slot]
    const matched = all.filter((r) => cats.includes(r.category))
    return matched.length > 0 ? matched : all
  }
  const pick = (arr: { id: number }[]) => arr[Math.floor(Math.random() * arr.length)]

  // Replace the whole week.
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, dates[0], dates[6])))

  // usage[bucket][recipeId] — how many times a recipe is already in this week.
  const usage = new Map<string, Map<number, number>>()
  const usesOf = (bucket: string, id: number) => usage.get(bucket)?.get(id) ?? 0
  const bump = (bucket: string, id: number) => {
    const b = usage.get(bucket) ?? new Map<number, number>()
    b.set(id, (b.get(id) ?? 0) + 1)
    usage.set(bucket, b)
  }

  let inserted = 0
  let usedYesterday = new Set<number>()
  for (const date of dates) {
    const usedToday = new Set<number>()
    for (const slot of GEN_SLOTS) {
      const bucket = USAGE_BUCKET[slot]
      const p = pool(slot)
      // The weekly cap is the hard constraint, so it filters first. Only when the
      // pool is too small to honour it do we fall back to the least-used recipes,
      // which spreads the unavoidable repeats evenly.
      const underCap = p.filter((r) => usesOf(bucket, r.id) < MAX_WEEKLY_REPEATS)
      const capped = underCap.length > 0 ? underCap : leastUsed(p, (r) => usesOf(bucket, r.id))
      // Then soft preferences: nothing twice in one day, and not yesterday's dish.
      const fresh = capped.filter((r) => !usedToday.has(r.id))
      const eligible = fresh.length > 0 ? fresh : capped
      const notYesterday = eligible.filter((r) => !usedYesterday.has(r.id))
      const choice = pick(notYesterday.length > 0 ? notYesterday : eligible)
      if (!choice) continue
      usedToday.add(choice.id)
      bump(bucket, choice.id)
      await db.insert(meal_plan_entries).values({
        user_id: userId,
        date,
        meal_type: slot,
        recipe_id: choice.id,
        product_id: null,
        grams: null,
        servings: 1,
        batch_group: null,
        is_leftover: false,
        status: 'planned',
      })
      inserted++
    }
    usedYesterday = usedToday
  }

  return c.json({ inserted })
})

export { app as planRouter }
