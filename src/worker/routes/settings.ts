import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, settings } from '../db/index'
import type { AppEnv, Env } from '../types'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

const app = new Hono<AppEnv>()

export async function getSettings(env: Env, userId: string): Promise<AppSettings> {
  const db = getDb(env.DB)
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.user_id, userId), eq(settings.key, 'app')))
  if (!row) return DEFAULT_SETTINGS
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } as AppSettings
}

// GET /api/settings
app.get('/', async (c) => {
  return c.json(await getSettings(c.env, c.var.userId))
})

// PUT /api/settings
app.put('/', async (c) => {
  const body = await c.req.json()
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const current = await getSettings(c.env, userId)
  const merged = { ...current, ...body }

  await db.insert(settings)
    .values({ user_id: userId, key: 'app', value: JSON.stringify(merged) })
    .onConflictDoUpdate({
      target: [settings.user_id, settings.key],
      set: { value: JSON.stringify(merged) },
    })

  return c.json(merged)
})

// GET /api/settings/user-config  — arbitrary per-user config (Frisco creds, etc.)
app.get('/user-config', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.user_id, userId), eq(settings.key, 'user_config')))
  if (!row) return c.json({})
  return c.json(JSON.parse(row.value))
})

// PUT /api/settings/user-config  — save per-user config (merges with existing)
app.put('/user-config', async (c) => {
  const body = await c.req.json() as Record<string, unknown>
  const userId = c.var.userId
  const db = getDb(c.env.DB)

  const [existing] = await db.select().from(settings)
    .where(and(eq(settings.user_id, userId), eq(settings.key, 'user_config')))
  const current = existing ? JSON.parse(existing.value) as Record<string, unknown> : {}
  const merged = { ...current, ...body }

  await db.insert(settings)
    .values({ user_id: userId, key: 'user_config', value: JSON.stringify(merged) })
    .onConflictDoUpdate({
      target: [settings.user_id, settings.key],
      set: { value: JSON.stringify(merged) },
    })

  return c.json(merged)
})

export { app as settingsRouter }
