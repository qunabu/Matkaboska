import { Hono } from 'hono'
import { eq, like, and, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, recipes, recipe_notes } from '../db/index'
import type { Env } from '../types'
import type { Recipe, RecipeWithNotes, Ingredient, Macros } from '../../shared/types'

const app = new Hono<{ Bindings: Env }>()

function parseRecipe(row: typeof recipes.$inferSelect): Recipe {
  return {
    ...row,
    category: row.category as Recipe['category'],
    ingredients: JSON.parse(row.ingredients) as Ingredient[],
    steps: JSON.parse(row.steps) as string[],
    tags: JSON.parse(row.tags) as string[],
    macros: row.macros ? JSON.parse(row.macros) as Macros : null,
    macros_confidence: row.macros_confidence as Recipe['macros_confidence'],
  }
}

// GET /api/recipes
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { search, category, tag, seafood } = c.req.query()

  let q = db.select().from(recipes).$dynamic()

  const filters = []
  if (category) filters.push(eq(recipes.category, category))
  if (seafood === '1') filters.push(eq(recipes.is_seafood, true))
  if (search) {
    filters.push(
      or(
        like(recipes.title, `%${search}%`),
        like(recipes.tags, `%${search}%`),
      )!
    )
  }
  if (tag) filters.push(like(recipes.tags, `%${tag}%`))
  if (filters.length) q = q.where(and(...filters))

  const rows = await q.orderBy(recipes.title)
  return c.json({ items: rows.map(parseRecipe), total: rows.length })
})

// GET /api/recipes/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id))
  if (!recipe) return c.json({ error: 'Not found' }, 404)

  const notes = await db.select().from(recipe_notes)
    .where(eq(recipe_notes.recipe_id, id))
    .orderBy(recipe_notes.created_at)

  const result: RecipeWithNotes = { ...parseRecipe(recipe), notes }
  return c.json(result)
})

const IngredientSchema = z.object({ name: z.string(), amount: z.string(), unit: z.string() })
const RecipeBodySchema = z.object({
  title: z.string().min(1),
  category: z.enum(['breakfast', 'main', 'snack', 'classic']),
  servings: z.number().int().positive().default(1),
  prep_minutes: z.number().int().nonnegative().nullable().optional(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  is_seafood: z.boolean().default(false),
  source: z.string().nullable().optional(),
  macros: z.object({
    kcal: z.number(), protein_g: z.number(), carbs_g: z.number(),
    fat_g: z.number(), fiber_g: z.number(),
  }).nullable().optional(),
  macros_confidence: z.enum(['low', 'medium', 'high']).nullable().optional(),
  macros_assumptions: z.string().nullable().optional(),
})

function toSlug(title: string) {
  return title.toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// POST /api/recipes
app.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = RecipeBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)
  const slug = toSlug(d.title)

  const [row] = await db.insert(recipes).values({
    title: d.title,
    slug,
    category: d.category,
    servings: d.servings,
    prep_minutes: d.prep_minutes ?? null,
    ingredients: JSON.stringify(d.ingredients),
    steps: JSON.stringify(d.steps),
    tags: JSON.stringify(d.tags),
    is_seafood: d.is_seafood,
    source: d.source ?? null,
    macros: d.macros ? JSON.stringify(d.macros) : null,
    macros_confidence: d.macros_confidence ?? null,
    macros_assumptions: d.macros_assumptions ?? null,
  }).returning()

  // Auto-estimate macros if not provided
  if (!d.macros && c.env.ANTHROPIC_API_KEY) {
    c.executionCtx.waitUntil(estimateMacros(c.env, row.id, d.title, d.servings, d.ingredients))
  }

  return c.json(parseRecipe(row), 201)
})

// PATCH /api/recipes/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const parsed = RecipeBodySchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const d = parsed.data
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = { updated_at: sql`(unixepoch())` }

  if (d.title !== undefined) { updates.title = d.title; updates.slug = toSlug(d.title) }
  if (d.category !== undefined) updates.category = d.category
  if (d.servings !== undefined) updates.servings = d.servings
  if (d.prep_minutes !== undefined) updates.prep_minutes = d.prep_minutes
  if (d.ingredients !== undefined) updates.ingredients = JSON.stringify(d.ingredients)
  if (d.steps !== undefined) updates.steps = JSON.stringify(d.steps)
  if (d.tags !== undefined) updates.tags = JSON.stringify(d.tags)
  if (d.is_seafood !== undefined) updates.is_seafood = d.is_seafood
  if (d.source !== undefined) updates.source = d.source
  if (d.macros !== undefined) updates.macros = d.macros ? JSON.stringify(d.macros) : null
  if (d.macros_confidence !== undefined) updates.macros_confidence = d.macros_confidence
  if (d.macros_assumptions !== undefined) updates.macros_assumptions = d.macros_assumptions

  const [row] = await db.update(recipes).set(updates).where(eq(recipes.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(parseRecipe(row))
})

// DELETE /api/recipes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(recipes).where(eq(recipes.id, id))
  return c.json({ ok: true })
})

// POST /api/recipes/:id/notes
app.post('/:id/notes', async (c) => {
  const recipe_id = Number(c.req.param('id'))
  const body = await c.req.json()
  const { body: text } = z.object({ body: z.string().min(1) }).parse(body)
  const db = getDb(c.env.DB)
  const [note] = await db.insert(recipe_notes).values({ recipe_id, body: text }).returning()
  return c.json(note, 201)
})

// DELETE /api/recipes/:id/notes/:noteId
app.delete('/:id/notes/:noteId', async (c) => {
  const noteId = Number(c.req.param('noteId'))
  const db = getDb(c.env.DB)
  await db.delete(recipe_notes).where(eq(recipe_notes.id, noteId))
  return c.json({ ok: true })
})

// POST /api/recipes/:id/recalc-macros
app.post('/:id/recalc-macros', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id))
  if (!recipe) return c.json({ error: 'Not found' }, 404)

  const ingredients = JSON.parse(recipe.ingredients) as Ingredient[]
  await estimateMacros(c.env, id, recipe.title, recipe.servings, ingredients)

  const [updated] = await db.select().from(recipes).where(eq(recipes.id, id))
  return c.json(parseRecipe(updated))
})

async function estimateMacros(env: Env, recipeId: number, title: string, servings: number, ingredients: Ingredient[]) {
  try {
    const ingredientText = ingredients
      .map(i => `${i.amount} ${i.unit} ${i.name}`.trim())
      .join(', ')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 300,
        system: 'You are a nutrition estimator. Return ONLY valid JSON, no prose, no code fences.',
        messages: [{
          role: 'user',
          content: `Estimate macronutrients per serving for this recipe.\nTitle: ${title}\nServings: ${servings}\nIngredients: ${ingredientText}\n\nReturn exactly this JSON:\n{"per_serving":{"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0},"confidence":"medium","assumptions":"brief note"}`,
        }],
      }),
    })

    if (!response.ok) return

    const data = await response.json() as { content: Array<{ text: string }> }
    const text = data.content?.[0]?.text ?? ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    const MacroResult = z.object({
      per_serving: z.object({
        kcal: z.number(), protein_g: z.number(), carbs_g: z.number(),
        fat_g: z.number(), fiber_g: z.number(),
      }),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
      assumptions: z.string().optional(),
    })

    const result = MacroResult.parse(parsed)
    const db = getDb(env.DB)
    await db.update(recipes).set({
      macros: JSON.stringify(result.per_serving),
      macros_confidence: result.confidence ?? 'medium',
      macros_assumptions: result.assumptions ?? null,
      updated_at: sql`(unixepoch())`,
    }).where(eq(recipes.id, recipeId))
  } catch {
    // Fail silently — macro estimation is best-effort
  }
}

export { app as recipesRouter }
