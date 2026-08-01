import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, ideas } from '../db/index'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

// GET /api/ideas
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const rows = await db.select().from(ideas)
    .where(eq(ideas.user_id, userId))
    .orderBy(ideas.sort_order, ideas.created_at)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/ideas
app.post('/', async (c) => {
  const parsed = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.insert(ideas).values({
    user_id: userId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
  }).returning()
  return c.json(row, 201)
})

// PATCH /api/ideas/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const parsed = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    done: z.boolean().optional(),
    sort_order: z.number().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(ideas).set(parsed.data)
    .where(and(eq(ideas.id, id), eq(ideas.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/ideas/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(ideas).where(and(eq(ideas.id, id), eq(ideas.user_id, userId)))
  return c.json({ ok: true })
})

export { app as ideasRouter }
