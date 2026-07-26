import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { accessAuth } from './middleware/auth'
import { recipesRouter } from './routes/recipes'
import { planRouter } from './routes/plan'
import { settingsRouter } from './routes/settings'
import { shoppingRouter } from './routes/shopping'
import { foodLogRouter } from './routes/food-log'
import { waterRouter } from './routes/water'
import { supplementsRouter } from './routes/supplements'
import { pushRouter, sendPushNotification } from './routes/push'
import { getDb, reminders, push_subscriptions } from './db/index'
import { eq } from 'drizzle-orm'

const api = new Hono<{ Bindings: Env }>()

api.use('*', cors())
api.use('*', accessAuth)

api.get('/api/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() })
)

api.get('/api/version', (c) =>
  c.json({
    version: c.env.APP_VERSION || 'dev',
    builtAt: null,
    minSupported: null,
  })
)

api.route('/api/recipes', recipesRouter)
api.route('/api/plan', planRouter)
api.route('/api/settings', settingsRouter)
api.route('/api/shopping-lists', shoppingRouter)
api.route('/api/food-log', foodLogRouter)
api.route('/api/water', waterRouter)
api.route('/api/supplements', supplementsRouter)
api.route('/api/push', pushRouter)

type AssetsBinding = { fetch: (r: Request) => Promise<Response> }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }

    const assets = env.ASSETS as unknown as AssetsBinding
    const res = await assets.fetch(request)

    if (res.status === 404) {
      const indexUrl = new URL('/index.html', url.origin)
      return assets.fetch(new Request(indexUrl.toString(), { headers: request.headers }))
    }

    return res
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.VAPID_PRIVATE_KEY) return

    const db = getDb(env.DB)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const currentTime = `${hh}:${mm}`

    const allReminders = await db.select().from(reminders)
    const subs = await db.select().from(push_subscriptions)
    if (subs.length === 0) return

    for (const reminder of allReminders) {
      if (!reminder.enabled) continue
      const days = JSON.parse(reminder.days) as number[]
      if (!days.includes(dayOfWeek)) continue
      if (reminder.time !== currentTime) continue

      await Promise.allSettled(
        subs.map(sub => sendPushNotification(env, sub.endpoint, sub.p256dh, sub.auth, {
          title: reminder.label,
          body: reminder.type === 'water' ? 'Pamiętaj o wypiciu wody 💧' :
            reminder.type === 'supplement' ? 'Czas na suplementy 💊' :
            'Przypomnienie z planera posiłków',
        }))
      )
    }
  },
} satisfies ExportedHandler<Env>
