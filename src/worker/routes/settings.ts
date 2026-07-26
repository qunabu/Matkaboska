import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, settings } from '../db/index'
import type { Env } from '../types'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

const app = new Hono<{ Bindings: Env }>()

async function getSettings(env: Env): Promise<AppSettings> {
  const db = getDb(env.DB)
  const [row] = await db.select().from(settings).where(eq(settings.key, 'app'))
  if (!row) return DEFAULT_SETTINGS
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } as AppSettings
}

// GET /api/settings
app.get('/', async (c) => {
  return c.json(await getSettings(c.env))
})

// PUT /api/settings
app.put('/', async (c) => {
  const body = await c.req.json()
  const db = getDb(c.env.DB)
  const current = await getSettings(c.env)
  const merged = { ...current, ...body }

  await db.insert(settings)
    .values({ key: 'app', value: JSON.stringify(merged) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(merged) } })

  return c.json(merged)
})

export { app as settingsRouter }
