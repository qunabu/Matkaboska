import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, pantry_items } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// GET /api/pantry
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(pantry_items).orderBy(pantry_items.name)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/pantry  { name }  — idempotent by name
app.post('/', async (c) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.insert(pantry_items).values({ name: parsed.data.name.trim() })
    .onConflictDoNothing({ target: pantry_items.name }).returning()
  if (row) return c.json(row, 201)
  const [existing] = await db.select().from(pantry_items).where(eq(pantry_items.name, parsed.data.name.trim()))
  return c.json(existing, 200)
})

// DELETE /api/pantry/:id  — ran out; may be bought again
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(pantry_items).where(eq(pantry_items.id, id))
  return c.json({ ok: true })
})

export { app as pantryRouter }
