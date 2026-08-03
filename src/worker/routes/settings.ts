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

// Read an arbitrary per-user config bucket (settings row) as a plain object.
async function readConfig(env: Env, userId: string, key: string): Promise<Record<string, unknown>> {
  const db = getDb(env.DB)
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.user_id, userId), eq(settings.key, key)))
  if (!row) return {}
  try { return JSON.parse(row.value) as Record<string, unknown> } catch { return {} }
}

// Merge a patch into a per-user config bucket, dropping empty-string fields so a
// blank input never wipes a stored secret.
async function writeConfig(env: Env, userId: string, key: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = getDb(env.DB)
  const current = await readConfig(env, userId, key)
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== '' && v != null))
  const merged = { ...current, ...clean }
  await db.insert(settings)
    .values({ user_id: userId, key, value: JSON.stringify(merged) })
    .onConflictDoUpdate({ target: [settings.user_id, settings.key], set: { value: JSON.stringify(merged) } })
  return merged
}

// Resolve the Anthropic API key for a user — PER-USER ONLY (settings key
// 'user_config'), never shared: no env fallback, so nobody uses another user's key.
export async function resolveAnthropicKey(env: Env, userId: string): Promise<string | undefined> {
  const cfg = await readConfig(env, userId, 'user_config')
  const key = typeof cfg.anthropic_api_key === 'string' ? cfg.anthropic_api_key.trim() : ''
  return key || undefined
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

// GET /api/settings/integrations — per-user Frisco + Anthropic config, secrets
// masked (only presence flags leave the server).
app.get('/integrations', async (c) => {
  const userId = c.var.userId
  const frisco = await readConfig(c.env, userId, 'frisco')
  const uc = await readConfig(c.env, userId, 'user_config')
  return c.json({
    frisco: {
      username: (frisco.username as string) ?? '',
      warehouse: (frisco.warehouse as string) ?? '',
      hasPassword: Boolean(frisco.password),
      hasRefreshToken: Boolean(frisco.refresh_token),
    },
    anthropic: { hasKey: Boolean((uc.anthropic_api_key as string) || '') },
  })
})

// PUT /api/settings/integrations — save Frisco creds and/or Anthropic key.
// Blank fields are ignored (never overwrite a stored secret with empty).
app.put('/integrations', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json().catch(() => ({})) as {
    frisco?: Record<string, unknown>
    anthropic_api_key?: string
  }
  if (body.frisco && typeof body.frisco === 'object') {
    await writeConfig(c.env, userId, 'frisco', body.frisco)
  }
  if (typeof body.anthropic_api_key === 'string') {
    await writeConfig(c.env, userId, 'user_config', { anthropic_api_key: body.anthropic_api_key })
  }
  return c.json({ ok: true })
})

export { app as settingsRouter }
