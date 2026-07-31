import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, shopping_lists, shopping_items, meal_plan_entries, recipes, pantry_items, products } from '../db/index'
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

// GET /api/shopping-lists/preview?from=&to=  — read-only aggregation (no DB
// write), used by the printable shopping checklist. Registered before /:id so
// it isn't shadowed by the id param route.
app.get('/preview', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  if (!from || !to) return c.json({ error: 'from/to required' }, 400)
  const db = getDb(c.env.DB)
  const items = await aggregateShoppingItems(db, from, to)
  return c.json({ items, total: items.length })
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

type AggregatedItem = { name: string; quantity: number | null; unit: string | null; category: ShopCategory; sort_order: number; frisco_product_id?: string | null }

// Aggregate the plan's recipe ingredients into a deduped shopping list for a
// date range (pantry items excluded). Shared by generate (persists) and the
// print preview (read-only).
async function aggregateShoppingItems(
  db: ReturnType<typeof getDb>, from: string, to: string,
): Promise<AggregatedItem[]> {
  const planRows = await db.select({ entry: meal_plan_entries, recipe: recipes })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .where(between(meal_plan_entries.date, from, to))

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

  const pantry = await db.select().from(pantry_items)
  const pantryKeys = new Set(pantry.map((p) => normalizeName(p.name).toLowerCase()))
  for (const key of [...aggregated.keys()]) {
    if (pantryKeys.has(key)) aggregated.delete(key)
  }

  let sortOrder = 0
  const items: AggregatedItem[] = []
  for (const { name, category, units } of aggregated.values()) {
    let bestUnit: string | null = null
    let bestQty = 0
    for (const [u, qv] of units) {
      if (qv > bestQty) { bestQty = qv; bestUnit = u }
    }
    items.push({
      name,
      quantity: bestQty > 0 ? Math.round(bestQty * 10) / 10 : null,
      unit: bestQty > 0 ? (bestUnit || null) : null,
      category,
      sort_order: sortOrder++,
    })
  }

  // Product plan entries (e.g. protein boosters) — one line per product, quantity
  // = number of portions in the range. Carry the Frisco pid so the cart fill can
  // add them directly without a name search.
  const prodRows = await db.select({ entry: meal_plan_entries, product: products })
    .from(meal_plan_entries)
    .innerJoin(products, eq(meal_plan_entries.product_id, products.id))
    .where(between(meal_plan_entries.date, from, to))
  const prodAgg = new Map<number, { name: string; count: number; frisco: string | null }>()
  for (const { product } of prodRows) {
    let g = prodAgg.get(product.id)
    if (!g) { g = { name: product.name, count: 0, frisco: product.frisco_product_id }; prodAgg.set(product.id, g) }
    g.count += 1
  }
  for (const g of prodAgg.values()) {
    if (pantryKeys.has(normalizeName(g.name).toLowerCase())) continue
    items.push({
      name: g.name,
      quantity: g.count,
      unit: 'szt',
      category: 'other',
      sort_order: sortOrder++,
      frisco_product_id: g.frisco,
    })
  }

  return items
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
  const aggregated = await aggregateShoppingItems(db, from, to)

  const listName = name ?? `Lista ${from} – ${to}`
  const [list] = await db.insert(shopping_lists).values({
    name: listName,
    type: 'generated',
    date_range_start: from,
    date_range_end: to,
  }).returning()

  const itemsToInsert = aggregated.map((it) => ({
    list_id: list.id,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    category: it.category,
    source: 'generated' as const,
    sort_order: it.sort_order,
    frisco_product_id: it.frisco_product_id ?? null,
  }))

  // D1 allows at most 100 bound parameters per query; cap each batch at 10 rows.
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
