import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, todos } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

const priority = z.enum(['high', 'medium', 'low'])

// GET /api/todos
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(todos).orderBy(todos.sort_order, todos.created_at)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/todos
app.post('/', async (c) => {
  const parsed = z.object({
    title: z.string().min(1),
    priority: priority.optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.insert(todos).values({
    title: parsed.data.title.trim(),
    priority: parsed.data.priority ?? 'medium',
  }).returning()
  return c.json(row, 201)
})

// PATCH /api/todos/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({
    title: z.string().min(1).optional(),
    priority: priority.optional(),
    done: z.boolean().optional(),
    sort_order: z.number().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(todos).set(parsed.data).where(eq(todos.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/todos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(todos).where(eq(todos.id, id))
  return c.json({ ok: true })
})

export { app as todosRouter }
