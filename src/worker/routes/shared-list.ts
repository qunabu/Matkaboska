import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, shopping_lists, shopping_items, settings } from '../db/index'
import { loadFullPlan } from './plan'
import type { AppEnv } from '../types'

// Public shared list routes — accessible by any authenticated user with the token.
// No ownership check: the token IS the proof of access.
const app = new Hono<AppEnv>()

// GET /api/s/plan/:token?from&to — public, READ-ONLY weekly plan for a share link.
app.get('/plan/:token', async (c) => {
  const token = c.req.param('token')
  const { from, to } = c.req.query()
  if (!from || !to) return c.json({ error: 'from and to required' }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.key, 'plan_share_token'), eq(settings.value, token)))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const items = await loadFullPlan(c.env, row.user_id, from, to)
  return c.json({ items })
})

// GET /api/s/:token — view a shared shopping list
app.get('/:token', async (c) => {
  const token = c.req.param('token')
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(eq(shopping_lists.share_token, token))
  if (!list) return c.json({ error: 'Not found' }, 404)
  const items = await db.select().from(shopping_items)
    .where(eq(shopping_items.list_id, list.id))
    .orderBy(shopping_items.sort_order, shopping_items.category)
  return c.json({ ...list, items })
})

// POST /api/s/:token/items — add an item to a shared list
app.post('/:token/items', async (c) => {
  const token = c.req.param('token')
  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists)
    .where(eq(shopping_lists.share_token, token))
  if (!list) return c.json({ error: 'Not found' }, 404)

  const parsed = z.object({
    name: z.string().min(1),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    category: z.enum(['produce', 'dairy', 'pantry', 'frozen', 'other']).default('other'),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [item] = await db.insert(shopping_items).values({
    list_id: list.id,
    name: parsed.data.name,
    quantity: parsed.data.quantity ?? null,
    unit: parsed.data.unit ?? null,
    category: parsed.data.category,
    source: 'manual',
  }).returning()
  return c.json(item, 201)
})

export { app as sharedListRouter }
