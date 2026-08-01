import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, pantry_items } from '../db/index'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

// GET /api/pantry
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const rows = await db.select().from(pantry_items)
    .where(eq(pantry_items.user_id, userId))
    .orderBy(pantry_items.name)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/pantry  { name }  — idempotent by name
app.post('/', async (c) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const userId = c.var.userId
  const name = parsed.data.name.trim()
  const db = getDb(c.env.DB)

  const [existing] = await db.select().from(pantry_items)
    .where(and(eq(pantry_items.user_id, userId), eq(pantry_items.name, name)))
  if (existing) return c.json(existing, 200)

  const [row] = await db.insert(pantry_items)
    .values({ user_id: userId, name })
    .returning()
  return c.json(row, 201)
})

// DELETE /api/pantry/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(pantry_items).where(and(eq(pantry_items.id, id), eq(pantry_items.user_id, userId)))
  return c.json({ ok: true })
})

export { app as pantryRouter }
