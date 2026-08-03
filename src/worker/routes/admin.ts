import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import type { AppEnv, Env } from '../types'

const app = new Hono<AppEnv>()

export function isAdmin(env: Env, userId: string): boolean {
  const admins = (env.ADMIN_EMAILS || 'qunabu.com@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return !!userId && admins.includes(userId.toLowerCase())
}

// Gate every admin route.
app.use('*', async (c, next) => {
  if (!isAdmin(c.env, c.var.userId)) return c.json({ error: 'forbidden' }, 403)
  return next()
})

// Every table keyed by user_id (deleted directly), and child tables (by parent).
const USER_TABLES = [
  'recipes', 'recipe_notes', 'meal_plan_entries', 'food_log', 'water_log',
  'supplements', 'shopping_lists', 'reminders', 'todos', 'ideas', 'sessions',
  'chores', 'habits', 'pantry_items', 'voice_notes', 'push_subscriptions',
  'notifications', 'settings', 'products',
]

async function groupCount(db: D1Database, table: string): Promise<Map<string, number>> {
  const { results } = await db.prepare(`SELECT user_id, COUNT(*) AS c FROM ${table} GROUP BY user_id`).all<{ user_id: string; c: number }>()
  return new Map(results.map((r) => [r.user_id, r.c]))
}

// GET /api/admin/users — every account with usage stats.
app.get('/users', async (c) => {
  const db = c.env.DB
  const [recipes, products, plan, foodLog, push, sessions] = await Promise.all(
    ['recipes', 'products', 'meal_plan_entries', 'food_log', 'push_subscriptions', 'sessions'].map((t) => groupCount(db, t)),
  )
  const { results: lastRows } = await db.prepare('SELECT user_id, MAX(created_at) AS last FROM food_log GROUP BY user_id').all<{ user_id: string; last: number }>()
  const lastLog = new Map(lastRows.map((r) => [r.user_id, r.last]))

  const emails = new Set<string>()
  for (const m of [recipes, products, plan, foodLog, push, sessions]) for (const k of m.keys()) if (k) emails.add(k)

  const users = [...emails].map((email) => ({
    email,
    recipes: recipes.get(email) ?? 0,
    products: products.get(email) ?? 0,
    planEntries: plan.get(email) ?? 0,
    foodLogs: foodLog.get(email) ?? 0,
    pushDevices: push.get(email) ?? 0,
    activeSessions: sessions.get(email) ?? 0,
    lastLogAt: lastLog.get(email) ?? null,
  })).sort((a, b) => (b.lastLogAt ?? 0) - (a.lastLogAt ?? 0) || b.planEntries - a.planEntries)

  return c.json({ users, admins: (c.env.ADMIN_EMAILS || 'qunabu.com@gmail.com').split(',').map((e) => e.trim().toLowerCase()) })
})

// DELETE /api/admin/users/:email — wipe every trace of an account.
app.delete('/users/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email'))
  const db = c.env.DB
  // Children first (no user_id column of their own).
  await db.prepare('DELETE FROM supplement_log WHERE supplement_id IN (SELECT id FROM supplements WHERE user_id=?)').bind(email).run()
  await db.prepare('DELETE FROM habit_checkins WHERE habit_id IN (SELECT id FROM habits WHERE user_id=?)').bind(email).run()
  await db.prepare('DELETE FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE user_id=?)').bind(email).run()
  for (const t of USER_TABLES) {
    await db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(email).run()
  }
  return c.json({ ok: true, deleted: email })
})

export { app as adminRouter }
