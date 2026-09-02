import { Hono } from 'hono'
import type { Context } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, block_rules, block_devices } from '../db/index'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

/**
 * Normalise what the user typed into what the phone matches against:
 * strip the scheme, "www." and any path, so pasting a full URL works.
 * A bare word ("facebook") is kept as-is — the phone treats a pattern with no
 * dot as a name to look for among the host's labels.
 */
export function normalisePattern(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim()
}

const ruleSchema = z.object({
  pattern: z.string().min(1),
  daily_limit_minutes: z.number().int().min(0).max(24 * 60).optional(),
  active: z.boolean().optional(),
})

// Minting and revoking device tokens is a browser-session privilege: a stolen
// phone token must not be able to issue itself more.
function requireSession(c: Context<AppEnv>): boolean {
  return c.var.authKind === 'session'
}

// ── Devices ─────────────────────────────────────────────────────────────────
// Registered before /:id so "devices" isn't swallowed by the id route.

// GET /api/blocks/devices
app.get('/devices', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const db = getDb(c.env.DB)
  const rows = await db.select().from(block_devices).where(eq(block_devices.user_id, c.var.userId))
  // Never echo the token back after creation; show only enough to identify it.
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    hint: `…${r.token.slice(-6)}`,
    last_seen_at: r.last_seen_at,
    created_at: r.created_at,
  }))
  return c.json({ items, total: items.length })
})

// POST /api/blocks/devices  { name } → the token, shown exactly once
app.post('/devices', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const parsed = z.object({ name: z.string().min(1).max(60) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

  const db = getDb(c.env.DB)
  const [row] = await db.insert(block_devices)
    .values({ user_id: c.var.userId, name: parsed.data.name.trim(), token })
    .returning()
  return c.json({ id: row.id, name: row.name, token }, 201)
})

// DELETE /api/blocks/devices/:id
app.delete('/devices/:id', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(block_devices)
    .where(and(eq(block_devices.id, id), eq(block_devices.user_id, c.var.userId)))
  return c.json({ ok: true })
})

// ── Rules ───────────────────────────────────────────────────────────────────

// GET /api/blocks — the phone polls this; the PWA renders it
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(block_rules)
    .where(eq(block_rules.user_id, c.var.userId))
    .orderBy(block_rules.pattern)
  return c.json({ items: rows, total: rows.length })
})

// POST /api/blocks  { pattern, daily_limit_minutes? }
app.post('/', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const parsed = ruleSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const pattern = normalisePattern(parsed.data.pattern)
  if (!pattern) return c.json({ error: 'empty pattern' }, 400)

  const db = getDb(c.env.DB)
  const [row] = await db.insert(block_rules)
    .values({
      user_id: c.var.userId,
      pattern,
      daily_limit_minutes: parsed.data.daily_limit_minutes ?? 0,
    })
    .onConflictDoUpdate({
      target: [block_rules.user_id, block_rules.pattern],
      set: { daily_limit_minutes: parsed.data.daily_limit_minutes ?? 0, active: true },
    })
    .returning()
  return c.json(row, 201)
})

// PATCH /api/blocks/:id
app.patch('/:id', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const id = Number(c.req.param('id'))
  const parsed = ruleSchema.partial().safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const patch = { ...parsed.data }
  if (patch.pattern !== undefined) patch.pattern = normalisePattern(patch.pattern)

  const db = getDb(c.env.DB)
  const [row] = await db.update(block_rules).set(patch)
    .where(and(eq(block_rules.id, id), eq(block_rules.user_id, c.var.userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/blocks/:id
app.delete('/:id', async (c) => {
  if (!requireSession(c)) return c.json({ error: 'session required' }, 403)
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(block_rules)
    .where(and(eq(block_rules.id, id), eq(block_rules.user_id, c.var.userId)))
  return c.json({ ok: true })
})

export { app as blocksRouter }
