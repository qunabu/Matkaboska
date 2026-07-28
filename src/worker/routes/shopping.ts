import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, shopping_lists, shopping_items, meal_plan_entries, recipes, pantry_items } from '../db/index'
import type { Env } from '../types'
import type { ShoppingList, ShoppingItem, Ingredient, ShopCategory } from '../../shared/types'
import { removeProductFromCart } from './frisco'

const app = new Hono<{ Bindings: Env }>()

// GET /api/shopping-lists
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const lists = await db.select().from(shopping_lists).orderBy(shopping_lists.created_at)

  const withCounts: ShoppingList[] = []
  for (const list of lists) {
    const items = await db.select().from(shopping_items).where(eq(shopping_items.list_id, list.id))
    withCounts.push({
      ...list,
      type: list.type as ShoppingList['type'],
      item_count: items.length,
      checked_count: items.filter(i => i.checked).length,
    })
  }
  return c.json({ items: withCounts, total: withCounts.length })
})

// GET /api/shopping-lists/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists).where(eq(shopping_lists.id, id))
  if (!list) return c.json({ error: 'Not found' }, 404)
  const items = await db.select().from(shopping_items)
    .where(eq(shopping_items.list_id, id))
    .orderBy(shopping_items.sort_order, shopping_items.category)
  return c.json({ ...list, items })
})

// POST /api/shopping-lists
app.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = z.object({ name: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [list] = await db.insert(shopping_lists).values({ name: parsed.data.name, type: 'manual' }).returning()
  return c.json(list, 201)
})

// DELETE /api/shopping-lists/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(shopping_lists).where(eq(shopping_lists.id, id))
  return c.json({ ok: true })
})

const INGREDIENT_CATEGORIES: Record<string, ShopCategory> = {
  // produce
  cebula: 'produce', czosnek: 'produce', pomidor: 'produce', szpinak: 'produce',
  marchew: 'produce', papryka: 'produce', cukinia: 'produce', brokuł: 'produce',
  awokado: 'produce', cytryna: 'produce', owoce: 'produce', jagody: 'produce',
  // dairy
  jajk: 'dairy', jogurt: 'dairy', mleko: 'dairy', ser: 'dairy', masło: 'dairy',
  śmietank: 'dairy', twaróg: 'dairy', parmezan: 'dairy', halloumi: 'dairy',
  // pantry
  makaron: 'pantry', ryż: 'pantry', oliwk: 'pantry', sos: 'pantry', oliw: 'pantry',
  mąk: 'pantry', płatki: 'pantry', odżywk: 'pantry', miód: 'pantry', orzechy: 'pantry',
  czekolad: 'pantry', ciecierzyc: 'pantry', fasol: 'pantry', soczewic: 'pantry',
  tempeh: 'pantry', tofu: 'pantry', konserw: 'pantry', puszk: 'pantry', tuńczyk: 'pantry',
  // frozen
  mrożon: 'frozen', krewetkl: 'frozen',
}

function guessCategory(name: string): ShopCategory {
  const lower = name.toLowerCase()
  for (const [key, cat] of Object.entries(INGREDIENT_CATEGORIES)) {
    if (lower.includes(key)) return cat
  }
  return 'other'
}

// Map common Polish declension/variant forms to one canonical name so the same
// produce merges on the list (e.g. "marchewka"/"marchewki" → "marchew").
const LEMMAS: Record<string, string> = {
  marchewka: 'marchew', marchewki: 'marchew',
  cebule: 'cebula',
  ziemniaki: 'ziemniak',
  pomidory: 'pomidor', pomidorki: 'pomidorki koktajlowe',
  jajka: 'jajko',
  banany: 'banan',
  ogórki: 'ogórek',
  papryki: 'papryka', 'papryka czerwona': 'papryka',
  cukinie: 'cukinia',
  bakłażany: 'bakłażan',
  cytryny: 'cytryna',
}

// Normalise an ingredient name for aggregation so variants of the same item
// merge on the shopping list: drop parenthetical qualifiers ("mleko (lub napój
// roślinny)" → "mleko", "czosnek (starty)" → "czosnek"), drop trailing use
// qualifiers ("olej do smażenia" → "olej", "jogurt do podania" → "jogurt"),
// collapse whitespace, then apply the lemma map above.
function normalizeName(name: string): string {
  const clean = name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+do\s+(smażenia|podania|maczania|dekoracji|smaku|posypania)\b.*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return LEMMAS[clean.toLowerCase()] ?? clean
}

// POST /api/shopping-lists/generate
app.post('/generate', async (c) => {
  const body = await c.req.json()
  const parsed = z.object({
    from: z.string(),
    to: z.string(),
    name: z.string().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { from, to, name } = parsed.data

  const db = getDb(c.env.DB)
  const planRows = await db.select({ entry: meal_plan_entries, recipe: recipes })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .where(between(meal_plan_entries.date, from, to))

  // Aggregate ingredients by normalised name (one line per product). Quantities
  // are summed per unit; different units for the same product are kept as
  // separate running totals and the largest is shown, so "mleko" appears once.
  const aggregated = new Map<string, { name: string; category: ShopCategory; units: Map<string, number> }>()
  for (const { entry, recipe } of planRows) {
    if (!recipe) continue
    const ingredients = JSON.parse(recipe.ingredients) as Ingredient[]
    for (const ing of ingredients) {
      const clean = normalizeName(ing.name || '')
      if (!clean) continue
      const key = clean.toLowerCase()
      const qty = (parseFloat(ing.amount) || 0) * entry.servings
      let g = aggregated.get(key)
      if (!g) { g = { name: clean, category: guessCategory(clean), units: new Map() }; aggregated.set(key, g) }
      const u = ing.unit || ''
      g.units.set(u, (g.units.get(u) || 0) + qty)
    }
  }

  // Drop anything already in the pantry so it isn't re-added to the list.
  const pantry = await db.select().from(pantry_items)
  const pantryKeys = new Set(pantry.map((p) => normalizeName(p.name).toLowerCase()))
  for (const key of [...aggregated.keys()]) {
    if (pantryKeys.has(key)) aggregated.delete(key)
  }

  const listName = name ?? `Lista ${from} – ${to}`
  const [list] = await db.insert(shopping_lists).values({
    name: listName,
    type: 'generated',
    date_range_start: from,
    date_range_end: to,
  }).returning()

  let sortOrder = 0
  const itemsToInsert = []
  for (const { name, category, units } of aggregated.values()) {
    // Pick the unit with the largest summed quantity as the one to display.
    let bestUnit: string | null = null
    let bestQty = 0
    for (const [u, qv] of units) {
      if (qv > bestQty) { bestQty = qv; bestUnit = u }
    }
    itemsToInsert.push({
      list_id: list.id,
      name,
      // Ingredients with no numeric amount ("garść", "do smaku") aggregate to 0
      // — store null so the UI shows just the name, not a meaningless "0".
      quantity: bestQty > 0 ? Math.round(bestQty * 10) / 10 : null,
      unit: bestQty > 0 ? (bestUnit || null) : null,
      category,
      source: 'generated' as const,
      sort_order: sortOrder++,
    })
  }

  // D1 allows at most 100 bound parameters per query. Drizzle binds 8 columns
  // per row for this insert (incl. the `checked` default), so cap each batch at
  // 10 rows (80 params) to stay safely under the limit.
  const CHUNK = 10
  for (let i = 0; i < itemsToInsert.length; i += CHUNK) {
    await db.insert(shopping_items).values(itemsToInsert.slice(i, i + CHUNK))
  }

  const items = await db.select().from(shopping_items).where(eq(shopping_items.list_id, list.id))
  return c.json({ ...list, items, item_count: items.length, checked_count: 0 }, 201)
})

// POST /api/shopping-items
app.post('/items', async (c) => {
  const body = await c.req.json()
  const parsed = z.object({
    list_id: z.number().int(),
    name: z.string().min(1),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    category: z.enum(['produce', 'dairy', 'pantry', 'frozen', 'other']).default('other'),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [item] = await db.insert(shopping_items).values({
    ...parsed.data,
    quantity: parsed.data.quantity ?? null,
    unit: parsed.data.unit ?? null,
    source: 'manual',
  }).returning()
  return c.json(item, 201)
})

// PATCH /api/shopping-items/:id
app.patch('/items/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const parsed = z.object({
    checked: z.boolean().optional(),
    in_frisco: z.boolean().optional(),
    name: z.string().optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    category: z.enum(['produce', 'dairy', 'pantry', 'frozen', 'other']).optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [item] = await db.update(shopping_items).set(parsed.data).where(eq(shopping_items.id, id)).returning()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

// DELETE /api/shopping-items/:id — also drops the product from the Frisco cart
// if it was there, so deleting a line keeps the cart in sync.
app.delete('/items/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, id))
  let removedFromCart = false
  if (item?.in_frisco && item.frisco_product_id) {
    try { removedFromCart = await removeProductFromCart(c.env, item.frisco_product_id) }
    catch { /* Frisco auth/network issue — still delete the row */ }
  }
  await db.delete(shopping_items).where(eq(shopping_items.id, id))
  return c.json({ ok: true, removedFromCart })
})

// POST /api/shopping-lists/items/:id/have-at-home
// "Mam to w domu": move the item to the pantry, drop it from the Frisco cart
// (if it was there), and remove it from the shopping list.
app.post('/items/:id/have-at-home', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, id))
  if (!item) return c.json({ error: 'Not found' }, 404)

  let removedFromCart = false
  if (item.in_frisco && item.frisco_product_id) {
    try { removedFromCart = await removeProductFromCart(c.env, item.frisco_product_id) }
    catch { /* Frisco auth/network issue — still move to pantry */ }
  }

  await db.insert(pantry_items).values({ name: item.name })
    .onConflictDoNothing({ target: pantry_items.name })
  await db.delete(shopping_items).where(eq(shopping_items.id, id))

  return c.json({ ok: true, pantry: item.name, removedFromCart })
})

export { app as shoppingRouter }
