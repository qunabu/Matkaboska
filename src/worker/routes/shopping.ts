import { Hono } from 'hono'
import { eq, and, between } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, shopping_lists, shopping_items, meal_plan_entries, recipes } from '../db/index'
import type { Env } from '../types'
import type { ShoppingList, ShoppingItem, Ingredient, ShopCategory } from '../../shared/types'

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

  // Aggregate ingredients
  const aggregated = new Map<string, { quantity: number; unit: string; category: ShopCategory }>()
  for (const { entry, recipe } of planRows) {
    if (!recipe) continue
    const ingredients = JSON.parse(recipe.ingredients) as Ingredient[]
    for (const ing of ingredients) {
      if (!ing.name) continue
      const key = `${ing.name.toLowerCase()}__${ing.unit}`
      const qty = parseFloat(ing.amount) || 0
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += qty * entry.servings
      } else {
        aggregated.set(key, {
          quantity: qty * entry.servings,
          unit: ing.unit,
          category: guessCategory(ing.name),
        })
      }
    }
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
  for (const [key, { quantity, unit, category }] of aggregated) {
    const name = key.split('__')[0]
    itemsToInsert.push({
      list_id: list.id,
      name,
      quantity: Math.round(quantity * 10) / 10,
      unit: unit || null,
      category,
      source: 'generated' as const,
      sort_order: sortOrder++,
    })
  }

  if (itemsToInsert.length > 0) {
    await db.insert(shopping_items).values(itemsToInsert)
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

// DELETE /api/shopping-items/:id
app.delete('/items/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(shopping_items).where(eq(shopping_items.id, id))
  return c.json({ ok: true })
})

export { app as shoppingRouter }
