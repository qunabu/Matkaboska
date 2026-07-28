import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, ideas } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// GET /api/ideas
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(ideas).orderBy(ideas.sort_order, ideas.created_at)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/ideas
app.post('/', async (c) => {
  const parsed = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.insert(ideas).values({
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
  }).returning()
  return c.json(row, 201)
})

// PATCH /api/ideas/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    done: z.boolean().optional(),
    sort_order: z.number().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(ideas).set(parsed.data).where(eq(ideas.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/ideas/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(ideas).where(eq(ideas.id, id))
  return c.json({ ok: true })
})

export { app as ideasRouter }
