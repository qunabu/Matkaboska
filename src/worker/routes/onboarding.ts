import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, recipes, settings } from '../db/index'
import type { AppEnv, Env } from '../types'
import { resolveAnthropicKey, getSettings } from './settings'

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

const GeneratedRecipe = z.object({
  title: z.string().min(1),
  category: z.enum(CATEGORIES).catch('other'),
  servings: z.number().int().positive().catch(2),
  prep_minutes: z.number().int().nonnegative().nullable().catch(null),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    amount: z.string().catch(''),
    unit: z.string().catch(''),
  })).catch([]),
  steps: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  is_seafood: z.boolean().catch(false),
  macros: z.object({
    kcal: z.number(), protein_g: z.number(), carbs_g: z.number(),
    fat_g: z.number(), fiber_g: z.number().catch(0),
  }).nullable().catch(null),
})
type GeneratedRecipe = z.infer<typeof GeneratedRecipe>

function toSlug(title: string) {
  return title.toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Ask Claude to turn a list of dish names into structured recipe JSON.
async function generateRecipes(env: Env, apiKey: string, dishes: string[]): Promise<GeneratedRecipe[]> {
  const list = dishes.map((d, i) => `${i + 1}. ${d}`).join('\n')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: 'Jesteś polskim asystentem kulinarnym. Zamieniasz nazwy dań na przepisy jako ŚCISŁY JSON. Zwracasz WYŁĄCZNIE tablicę JSON, bez prozy, bez bloków kodu. Makroskładniki podawaj na 1 porcję, realistycznie oszacowane.',
      messages: [{
        role: 'user',
        content: `Dla każdej z poniższych potraw stwórz obiekt przepisu.\n${list}\n\nZwróć dokładnie tablicę JSON, gdzie każdy element ma pola:\n{"title": string (po polsku), "category": jedno z ["breakfast","lunch","dinner","snack","soup","salad","smoothie","dessert","other"], "servings": liczba (domyślnie 2), "prep_minutes": liczba lub null, "ingredients": [{"name": string, "amount": string, "unit": string}], "steps": [string, ...] (2-5 krótkich kroków), "tags": [string, ...], "is_seafood": boolean, "macros": {"kcal": liczba, "protein_g": liczba, "carbs_g": liczba, "fat_g": liczba, "fiber_g": liczba}}\n\nSkładniki podawaj z realnymi ilościami (amount + unit, np. "200"/"g", "2"/"szt"). Zwróć TYLKO tablicę JSON.`,
      }],
    }),
  })
  if (!response.ok) throw new Error(`anthropic ${response.status}`)
  const data = await response.json() as { content?: Array<{ text?: string }> }
  let text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
  // Be tolerant: grab the outermost JSON array if the model added stray text.
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  const parsed = JSON.parse(text) as unknown[]
  if (!Array.isArray(parsed)) throw new Error('not an array')
  return parsed
    .map((r) => GeneratedRecipe.safeParse(r))
    .filter((r): r is { success: true; data: GeneratedRecipe } => r.success)
    .map((r) => r.data)
}

// POST /api/onboarding/generate — build the user's starter recipes from a list
// of dishes, and store their daily kcal / protein targets.
app.post('/generate', async (c) => {
  const userId = c.var.userId
  const parsed = z.object({
    dishes: z.array(z.string().transform((s) => s.trim()).pipe(z.string().min(1))).min(1),
    kcal_target: z.number().int().positive().max(10000),
    protein_g_target: z.number().int().positive().max(1000),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { dishes, kcal_target, protein_g_target } = parsed.data

  const apiKey = await resolveAnthropicKey(c.env, userId)
  if (!apiKey) {
    return c.json({ error: 'needs_key', message: 'Brak klucza API Anthropic — dodaj go w Ustawieniach.' }, 422)
  }

  let generated: GeneratedRecipe[]
  try {
    generated = await generateRecipes(c.env, apiKey, dishes)
  } catch {
    return c.json({ error: 'generation_failed', message: 'Nie udało się wygenerować przepisów. Spróbuj ponownie.' }, 502)
  }
  if (generated.length === 0) {
    return c.json({ error: 'generation_failed', message: 'Nie udało się odczytać przepisów. Spróbuj ponownie.' }, 502)
  }

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
  for (const r of generated) {
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

  return c.json({ imported })
})

export { app as onboardingRouter }
