import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, shopping_lists, shopping_items, meal_plan_entries, recipes, pantry_items, products } from '../db/index'
import type { AppEnv } from '../types'
import type { ShoppingList, ShoppingItem, Ingredient, ShopCategory } from '../../shared/types'
import { removeProductFromCart } from './frisco'

const app = new Hono<AppEnv>()

// GET /api/shopping-lists
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const lists = await db.select().from(shopping_lists)
    .where(eq(shopping_lists.user_id, userId))
    .orderBy(shopping_lists.created_at)

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

// GET /api/shopping-lists/preview?from=&to=
app.get('/preview', async (c) => {
  const userId = c.var.userId
  const from = c.req.query('from')
  const to = c.req.query('to')
  if (!from || !to) return c.json({ error: 'from/to required' }, 400)
  const db = getDb(c.env.DB)
  const items = await aggregateShoppingItems(db, userId, from, to)
  return c.json({ items, total: items.length })
})

// GET /api/shopping-lists/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(and(eq(shopping_lists.id, id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)
  const items = await db.select().from(shopping_items)
    .where(eq(shopping_items.list_id, id))
    .orderBy(shopping_items.sort_order, shopping_items.category)
  return c.json({ ...list, items })
})

// GET /api/shopping-lists/:id/recipe-sources — for each item, which recipes in the
// list's date range use that ingredient. Keyed by item id → [{id,title,slug}].
app.get('/:id/recipe-sources', async (c) => {
  const listId = Number(c.req.param('id'))
  const userId = c.var.userId
  if (!Number.isFinite(listId)) return c.json({ error: 'invalid_id' }, 400)
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(and(eq(shopping_lists.id, listId), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)

  const sources: Record<number, { id: number; title: string; slug: string }[]> = {}
  const from = list.date_range_start, to = list.date_range_end
  if (from && to) {
    const items = await db.select().from(shopping_items).where(eq(shopping_items.list_id, listId))
    const planRows = await db.select({ recipe: recipes }).from(meal_plan_entries)
      .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
      .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))
    const byKey = new Map<string, Map<number, { id: number; title: string; slug: string }>>()
    for (const { recipe } of planRows) {
      if (!recipe) continue
      let ings: Ingredient[] = []
      try { ings = JSON.parse(recipe.ingredients) as Ingredient[] } catch { /* ignore */ }
      for (const ing of ings) {
        const key = normalizeName(ing.name || '').toLowerCase()
        if (!key) continue
        let m = byKey.get(key)
        if (!m) { m = new Map(); byKey.set(key, m) }
        m.set(recipe.id, { id: recipe.id, title: recipe.title, slug: recipe.slug })
      }
    }
    for (const item of items) {
      const m = byKey.get(normalizeName(item.name).toLowerCase())
      if (m && m.size) sources[item.id] = [...m.values()]
    }
  }
  return c.json({ sources })
})

// POST /api/shopping-lists
app.post('/', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = z.object({ name: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [list] = await db.insert(shopping_lists)
    .values({ user_id: userId, name: parsed.data.name, type: 'manual' })
    .returning()
  return c.json(list, 201)
})

// POST /api/shopping-lists/:id/share  — generate a share token
app.post('/:id/share', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(and(eq(shopping_lists.id, id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)

  // Reuse existing token if already shared
  if (list.share_token) return c.json({ share_token: list.share_token })

  // Generate a random URL-safe token
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const [updated] = await db.update(shopping_lists)
    .set({ share_token: token })
    .where(eq(shopping_lists.id, id))
    .returning()
  return c.json({ share_token: updated.share_token })
})

// DELETE /api/shopping-lists/:id/share  — revoke share token
app.delete('/:id/share', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(and(eq(shopping_lists.id, id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)
  await db.update(shopping_lists).set({ share_token: null }).where(eq(shopping_lists.id, id))
  return c.json({ ok: true })
})

// DELETE /api/shopping-lists/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(shopping_lists)
    .where(and(eq(shopping_lists.id, id), eq(shopping_lists.user_id, userId)))
  return c.json({ ok: true })
})

const INGREDIENT_CATEGORIES: Record<string, ShopCategory> = {
  cebula: 'produce', czosnek: 'produce', pomidor: 'produce', szpinak: 'produce',
  marchew: 'produce', papryka: 'produce', cukinia: 'produce', brokuł: 'produce',
  awokado: 'produce', cytryna: 'produce', owoce: 'produce', jagody: 'produce',
  jajk: 'dairy', jogurt: 'dairy', mleko: 'dairy', ser: 'dairy', masło: 'dairy',
  śmietank: 'dairy', twaróg: 'dairy', parmezan: 'dairy', halloumi: 'dairy',
  makaron: 'pantry', ryż: 'pantry', oliwk: 'pantry', sos: 'pantry', oliw: 'pantry',
  mąk: 'pantry', płatki: 'pantry', odżywk: 'pantry', miód: 'pantry', orzechy: 'pantry',
  czekolad: 'pantry', ciecierzyc: 'pantry', fasol: 'pantry', soczewic: 'pantry',
  tempeh: 'pantry', tofu: 'pantry', konserw: 'pantry', puszk: 'pantry', tuńczyk: 'pantry',
  mrożon: 'frozen', krewetkl: 'frozen',
}

function guessCategory(name: string): ShopCategory {
  const lower = name.toLowerCase()
  for (const [key, cat] of Object.entries(INGREDIENT_CATEGORIES)) {
    if (lower.includes(key)) return cat
  }
  return 'other'
}

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

function normalizeName(name: string): string {
  const clean = name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+do\s+(smażenia|podania|maczania|dekoracji|smaku|posypania)\b.*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return LEMMAS[clean.toLowerCase()] ?? clean
}

type AggregatedItem = { name: string; quantity: number | null; unit: string | null; category: ShopCategory; sort_order: number; frisco_product_id?: string | null }

async function aggregateShoppingItems(
  db: ReturnType<typeof getDb>, userId: string, from: string, to: string,
): Promise<AggregatedItem[]> {
  const planRows = await db.select({ entry: meal_plan_entries, recipe: recipes })
    .from(meal_plan_entries)
    .leftJoin(recipes, eq(meal_plan_entries.recipe_id, recipes.id))
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))

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

  const pantry = await db.select().from(pantry_items).where(eq(pantry_items.user_id, userId))
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

  const prodRows = await db.select({ entry: meal_plan_entries, product: products })
    .from(meal_plan_entries)
    .innerJoin(products, eq(meal_plan_entries.product_id, products.id))
    .where(and(eq(meal_plan_entries.user_id, userId), between(meal_plan_entries.date, from, to)))
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
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = z.object({
    from: z.string(),
    to: z.string(),
    name: z.string().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { from, to, name } = parsed.data

  const db = getDb(c.env.DB)
  const aggregated = await aggregateShoppingItems(db, userId, from, to)

  const listName = name ?? `Lista ${from} – ${to}`
  const [list] = await db.insert(shopping_lists).values({
    user_id: userId,
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

  const CHUNK = 10
  for (let i = 0; i < itemsToInsert.length; i += CHUNK) {
    await db.insert(shopping_items).values(itemsToInsert.slice(i, i + CHUNK))
  }

  const items = await db.select().from(shopping_items).where(eq(shopping_items.list_id, list.id))
  return c.json({ ...list, items, item_count: items.length, checked_count: 0 }, 201)
})

// POST /api/shopping-items
app.post('/items', async (c) => {
  const userId = c.var.userId
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
  // Verify list belongs to user
  const [list] = await db.select({ id: shopping_lists.id }).from(shopping_lists)
    .where(and(eq(shopping_lists.id, parsed.data.list_id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)
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
  const userId = c.var.userId
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
  const [existing] = await db.select({ list_id: shopping_items.list_id }).from(shopping_items)
    .where(eq(shopping_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const [list] = await db.select({ id: shopping_lists.id }).from(shopping_lists)
    .where(and(eq(shopping_lists.id, existing.list_id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)
  const [item] = await db.update(shopping_items).set(parsed.data).where(eq(shopping_items.id, id)).returning()
  return c.json(item)
})

// DELETE /api/shopping-items/:id
app.delete('/items/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, id))
  if (!item) return c.json({ ok: true })
  const [list] = await db.select({ id: shopping_lists.id }).from(shopping_lists)
    .where(and(eq(shopping_lists.id, item.list_id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)
  let removedFromCart = false
  if (item.in_frisco && item.frisco_product_id) {
    try { removedFromCart = await removeProductFromCart(c.env, getDb(c.env.DB), userId, item.frisco_product_id) }
    catch { /* Frisco auth/network issue — still delete the row */ }
  }
  await db.delete(shopping_items).where(eq(shopping_items.id, id))
  return c.json({ ok: true, removedFromCart })
})

// POST /api/shopping-lists/items/:id/have-at-home
app.post('/items/:id/have-at-home', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, id))
  if (!item) return c.json({ error: 'Not found' }, 404)
  const [list] = await db.select({ id: shopping_lists.id }).from(shopping_lists)
    .where(and(eq(shopping_lists.id, item.list_id), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'Not found' }, 404)

  let removedFromCart = false
  if (item.in_frisco && item.frisco_product_id) {
    try { removedFromCart = await removeProductFromCart(c.env, getDb(c.env.DB), userId, item.frisco_product_id) }
    catch { /* Frisco auth/network issue — still move to pantry */ }
  }

  const existing = await db.select({ id: pantry_items.id }).from(pantry_items)
    .where(and(eq(pantry_items.user_id, userId), eq(pantry_items.name, item.name)))
    .limit(1)
  if (existing.length === 0) {
    await db.insert(pantry_items).values({ user_id: userId, name: item.name })
  }
  await db.delete(shopping_items).where(eq(shopping_items.id, id))

  return c.json({ ok: true, pantry: item.name, removedFromCart })
})

export { app as shoppingRouter }
