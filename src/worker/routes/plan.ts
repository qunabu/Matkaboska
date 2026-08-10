import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, meal_plan_entries, recipes, products, food_log, settings } from '../db/index'
import type { AppEnv, Env } from '../types'
import type { MealPlanEntry, MealPlanEntryFull, MealType, PlanStatus, Ingredient, Macros, Recipe, PlanProduct } from '../../shared/types'
import { getSettings } from './settings'

const app = new Hono<AppEnv>()

function toPlanProduct(p: typeof products.$inferSelect): PlanProduct {
  return { id: p.id, name: p.name, kcal: p.kcal, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g, iron_mg: p.iron_mg, serving_g: p.serving_g }
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
// The app writes only the four categories in `Category` (breakfast | main |
// snack | classic), but rows created before that vocabulary was narrowed still
// carry the old names (lunch/dinner/dessert/smoothie/soup/salad/other), so both
// are matched. Leaving 'main' and 'classic' out — as this map originally did —
// hid every current recipe from the draw and left the obiad/kolacja slots
// picking from a handful of legacy rows.
const SLOT_CATEGORIES: Record<string, string[]> = {
  breakfast: ['breakfast', 'smoothie'],
  lunch: ['main', 'classic', 'lunch', 'soup', 'salad', 'other'],
  dinner: ['main', 'classic', 'dinner', 'soup', 'salad', 'other'],
  snack: ['snack', 'dessert', 'smoothie'],
}
const GEN_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

// How many times one recipe may appear in a week, counted across every slot.
// One shared counter rather than per-slot ones: a dish eligible for two slots
// (a smoothie fits both breakfast and snack) would otherwise reach its limit
// twice over and show up four times.
const MAX_WEEKLY_REPEATS = 2
// Cook once, eat for this many consecutive days in the same slot. The second
// day is stored as a leftover entry sharing the first one's batch_group, which
// is what keeps the shopping list from buying the ingredients twice.
const BATCH_DAYS = 2

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

// Boosters are products pinned to every day rather than dishes drawn from the
// pool, so they sit outside the weekly-repeat cap — that cap exists to stop the
// same *meal* recurring, while a daily protein/iron top-up is the whole point.
const PROTEIN_BOOSTERS_PER_DAY = 2
const IRON_BOOSTERS_PER_DAY = 2
// The top-up pass aims at the user's own kcal target, with a band around it so
// a day is neither starved nor stuffed by one oversized portion.
const KCAL_UNDERSHOOT = 300
const KCAL_OVERSHOOT = 200

/** Nutrient delivered by one portion of a product (its columns are per 100 g). */
function perServing(p: { kcal: number | null; protein_g: number | null; iron_mg: number | null; serving_g: number | null }) {
  const f = (p.serving_g ?? 100) / 100
  return {
    kcal: (p.kcal ?? 0) * f,
    protein_g: (p.protein_g ?? 0) * f,
    iron_mg: (p.iron_mg ?? 0) * f,
  }
}

// Split day indexes into consecutive cooking blocks: [0,1], [2,3], [4,5], [6].
// A 7-day week leaves one odd day, which simply becomes a 1-day block.
function batchBlocks(dayCount: number, size: number): number[][] {
  const blocks: number[][] = []
  for (let i = 0; i < dayCount; i += size) {
    blocks.push(Array.from({ length: Math.min(size, dayCount - i) }, (_, k) => i + k))
  }
  return blocks
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
  const rows = await db.select({ id: recipes.id, category: recipes.category, macros: recipes.macros })
    .from(recipes).where(eq(recipes.user_id, userId))
  if (rows.length === 0) {
    return c.json({ error: 'no_recipes', message: 'Brak przepisów — dodaj je najpierw.' }, 422)
  }
  const all = rows.map((r) => {
    let kcal = 0, protein_g = 0
    try {
      const m = r.macros ? JSON.parse(r.macros) as Macros : null
      if (m) { kcal = m.kcal ?? 0; protein_g = m.protein_g ?? 0 }
    } catch { /* a recipe with unreadable macros just counts as 0 */ }
    return { id: r.id, category: r.category, kcal, protein_g }
  })

  const pool = (slot: MealType) => {
    const cats = SLOT_CATEGORIES[slot]
    const matched = all.filter((r) => cats.includes(r.category))
    return matched.length > 0 ? matched : all
  }
  const pick = <T>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)]

  // Replace the whole week.
  await db.delete(meal_plan_entries)
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, dates[0], dates[6])))

  // How many times each recipe is already placed this week, across all slots.
  const usage = new Map<number, number>()
  const usesOf = (id: number) => usage.get(id) ?? 0
  const bump = (id: number) => usage.set(id, usesOf(id) + 1)

  // One dish per cooking block instead of per day: the block's first day is the
  // cooking day, the rest are leftovers. Dishes deliberately repeat within a
  // block — that is the point — so there is no "avoid yesterday" rule here.
  const usedOnDay = dates.map(() => new Set<number>())
  const blocks = batchBlocks(dates.length, BATCH_DAYS)

  let inserted = 0
  let cookingSessions = 0
  const dayKcal = dates.map(() => 0)
  const dayProtein = dates.map(() => 0)
  for (const slot of GEN_SLOTS) {
    const p = pool(slot)
    for (const [blockIndex, block] of blocks.entries()) {
      // A block consumes one weekly slot per day it covers, so only dishes with
      // enough headroom left under the cap can take it. When the pool is too
      // small for that, fall back to the least-used ones so repeats spread out.
      const underCap = p.filter((r) => usesOf(r.id) + block.length <= MAX_WEEKLY_REPEATS)
      const capped = underCap.length > 0 ? underCap : leastUsed(p, (r) => usesOf(r.id))
      // Avoid colliding with what another slot already placed on these days.
      const free = capped.filter((r) => block.every((d) => !usedOnDay[d].has(r.id)))
      const choice = pick(free.length > 0 ? free : capped)
      if (!choice) continue

      const batchGroup = block.length > 1 ? `${weekStart}-${slot}-${blockIndex}` : null
      for (const [offset, day] of block.entries()) {
        usedOnDay[day].add(choice.id)
        bump(choice.id)
        dayKcal[day] += choice.kcal
        dayProtein[day] += choice.protein_g
        await db.insert(meal_plan_entries).values({
          user_id: userId,
          date: dates[day],
          meal_type: slot,
          recipe_id: choice.id,
          product_id: null,
          grams: null,
          servings: 1,
          batch_group: batchGroup,
          is_leftover: offset > 0,
          status: 'planned',
        })
        inserted++
      }
      cookingSessions++
    }
  }

  // --- Daily boosters -------------------------------------------------------
  // Pinned product portions that carry the protein and iron the cooked meals
  // alone do not reach. Ranked by what one portion actually delivers, not by the
  // per-100 g column — a 30 g granola beats nothing on protein per portion.
  const userProducts = await db.select().from(products).where(eq(products.user_id, userId))
  const proteinBoosters = userProducts
    .filter((p) => perServing(p).protein_g > 0)
    .sort((a, b) => perServing(b).protein_g - perServing(a).protein_g)
    .slice(0, PROTEIN_BOOSTERS_PER_DAY)
  const ironBoosters = userProducts
    .filter((p) => perServing(p).iron_mg > 0 && !proteinBoosters.some((x) => x.id === p.id))
    .sort((a, b) => perServing(b).iron_mg - perServing(a).iron_mg)
    .slice(0, IRON_BOOSTERS_PER_DAY)

  let boosterEntries = 0
  for (const [day, date] of dates.entries()) {
    for (const p of [...proteinBoosters, ...ironBoosters]) {
      const per = perServing(p)
      await db.insert(meal_plan_entries).values({
        user_id: userId,
        date,
        meal_type: 'snack',
        recipe_id: null,
        product_id: p.id,
        grams: p.serving_g ?? 100,
        servings: 1,
        batch_group: null,
        is_leftover: false,
        status: 'planned',
      })
      dayKcal[day] += per.kcal
      dayProtein[day] += per.protein_g
      inserted++
      boosterEntries++
    }
  }

  // --- Calorie floor --------------------------------------------------------
  // Top up each day with extra snack portions until it reaches the target band.
  // Highest protein per kcal first, so closing the calorie gap also closes the
  // protein gap instead of padding the day with empty calories.
  const appSettings = await getSettings(c.env, userId)
  const kcalAim = appSettings.kcal_target
  const kcalMin = kcalAim - KCAL_UNDERSHOOT
  const kcalMax = kcalAim + KCAL_OVERSHOOT
  const proteinAim = appSettings.protein_g_target

  const topUpPool = pool('snack').filter((r) => r.kcal > 0)
  let topUps = 0
  if (topUpPool.length > 0) {
    for (const [day, date] of dates.entries()) {
      for (let guard = 0; guard < 12 && dayKcal[day] < kcalAim; guard++) {
        // Top-ups obey the same weekly cap as meals, otherwise one snack would
        // be padded onto all seven days. Within what the cap allows, prefer the
        // most protein per kcal so closing the calorie gap also closes the
        // protein gap instead of adding empty calories.
        const allowed = topUpPool.filter((r) => !usedOnDay[day].has(r.id) && usesOf(r.id) < MAX_WEEKLY_REPEATS)
        const candidates = allowed.length > 0
          ? allowed
          : leastUsed(topUpPool.filter((r) => !usedOnDay[day].has(r.id)), (r) => usesOf(r.id))
        if (candidates.length === 0) break
        // While protein is still short, take the densest protein per kcal. Once
        // the protein target is met, switch to whatever best fits the remaining
        // calorie gap — otherwise the day keeps stacking protein and sails far
        // past the target (a 150 g goal ended up near 240 g in testing).
        const gap = kcalAim - dayKcal[day]
        const r = dayProtein[day] < proteinAim
          ? candidates.reduce((best, x) => (x.protein_g / x.kcal > best.protein_g / best.kcal ? x : best))
          : candidates.reduce((best, x) => (Math.abs(x.kcal - gap) < Math.abs(best.kcal - gap) ? x : best))
        // Stop once the day is decent and the next portion would overshoot.
        if (dayKcal[day] >= kcalMin && dayKcal[day] + r.kcal > kcalMax) break
        usedOnDay[day].add(r.id)
        bump(r.id)
        await db.insert(meal_plan_entries).values({
          user_id: userId,
          date,
          meal_type: 'snack',
          recipe_id: r.id,
          product_id: null,
          grams: null,
          servings: 1,
          batch_group: null,
          is_leftover: false,
          status: 'planned',
        })
        dayKcal[day] += r.kcal
        dayProtein[day] += r.protein_g
        inserted++
        topUps++
      }
    }
  }

  return c.json({
    inserted,
    cookingSessions,
    boosterEntries,
    topUps,
    avgKcal: Math.round(dayKcal.reduce((s, k) => s + k, 0) / dates.length),
    avgProtein: Math.round(dayProtein.reduce((s, p) => s + p, 0) / dates.length),
  })
})

export { app as planRouter }
