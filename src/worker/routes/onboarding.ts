import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, recipes, settings } from '../db/index'
import type { AppEnv } from '../types'
import { getSettings } from './settings'

const app = new Hono<AppEnv>()

// GET /api/onboarding/status — a fresh tenant (no recipes) still needs onboarding.
app.get('/status', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const rows = await db.select({ id: recipes.id }).from(recipes)
    .where(eq(recipes.user_id, userId)).limit(1)
  return c.json({ needsOnboarding: rows.length === 0 })
})

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'soup', 'salad', 'smoothie', 'dessert', 'other'] as const

// One recipe from the pasted JSON. Lenient: bad/missing fields fall back to
// sensible defaults so a slightly-off LLM answer still imports.
const IncomingRecipe = z.object({
  title: z.string().min(1),
  category: z.enum(CATEGORIES).catch('other'),
  servings: z.number().int().positive().catch(2),
  prep_minutes: z.number().int().nonnegative().nullable().catch(null),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    amount: z.union([z.string(), z.number()]).transform(String).catch(''),
    unit: z.string().catch(''),
  })).catch([]),
  steps: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  is_seafood: z.boolean().catch(false),
  macros: z.object({
    kcal: z.number(), protein_g: z.number(), carbs_g: z.number(),
    fat_g: z.number(), fiber_g: z.number().catch(0), iron_mg: z.number().catch(0),
  }).nullable().catch(null),
})
type IncomingRecipe = z.infer<typeof IncomingRecipe>

function toSlug(title: string) {
  return title.toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// POST /api/onboarding/import — import recipe JSON (produced by any LLM) and
// store the user's daily kcal / protein targets. No API key required.
app.post('/import', async (c) => {
  const userId = c.var.userId
  const parsed = z.object({
    recipes: z.array(IncomingRecipe).min(1),
    kcal_target: z.number().int().positive().max(10000),
    protein_g_target: z.number().int().positive().max(1000),
  }).safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: 'invalid', message: 'Nieprawidłowy JSON przepisów.' }, 400)
  }
  const { recipes: incoming, kcal_target, protein_g_target } = parsed.data

  const db = getDb(c.env.DB)

  // Persist the daily targets into the user's app settings.
  const current = await getSettings(c.env, userId)
  const mergedSettings = { ...current, kcal_target, protein_g_target }
  await db.insert(settings)
    .values({ user_id: userId, key: 'app', value: JSON.stringify(mergedSettings) })
    .onConflictDoUpdate({ target: [settings.user_id, settings.key], set: { value: JSON.stringify(mergedSettings) } })

  // Insert recipes, skipping slug collisions for this user.
  const seen = new Set<string>()
  let imported = 0
  for (const r of incoming as IncomingRecipe[]) {
    let slug = toSlug(r.title) || 'przepis'
    if (seen.has(slug)) continue
    const [dup] = await db.select({ id: recipes.id }).from(recipes)
      .where(and(eq(recipes.user_id, userId), eq(recipes.slug, slug))).limit(1)
    if (dup) continue
    seen.add(slug)
    await db.insert(recipes).values({
      user_id: userId,
      title: r.title,
      slug,
      category: r.category,
      servings: r.servings,
      prep_minutes: r.prep_minutes ?? null,
      ingredients: JSON.stringify(r.ingredients),
      steps: JSON.stringify(r.steps),
      tags: JSON.stringify(r.tags),
      is_seafood: r.is_seafood,
      source: 'onboarding',
      macros: r.macros ? JSON.stringify(r.macros) : null,
      macros_confidence: r.macros ? 'medium' : null,
      macros_assumptions: null,
    })
    imported++
  }

  if (imported === 0) {
    return c.json({ error: 'invalid', message: 'Nie zaimportowano żadnego przepisu.' }, 400)
  }
  return c.json({ imported })
})

export { app as onboardingRouter }
