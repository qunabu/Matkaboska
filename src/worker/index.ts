import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import type { Env } from './types'
import { accessAuth } from './middleware/auth'
import { authRouter, getPinHash, sessionToken, AUTH_COOKIE } from './routes/auth'
import { recipesRouter } from './routes/recipes'
import { planRouter } from './routes/plan'
import { settingsRouter } from './routes/settings'
import { shoppingRouter } from './routes/shopping'
import { foodLogRouter } from './routes/food-log'
import { productsRouter } from './routes/products'
import { waterRouter } from './routes/water'
import { supplementsRouter } from './routes/supplements'
import { pushRouter, sendPushNotification } from './routes/push'
import { getDb, reminders, push_subscriptions, settings } from './db/index'
import { eq } from 'drizzle-orm'

const api = new Hono<{ Bindings: Env }>()

api.use('*', cors())
api.use('*', accessAuth)

// PIN gate: everything under /api requires the auth cookie once a PIN is set.
// Open endpoints: auth itself, version and health (needed pre-login).
api.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/api/auth') || path === '/api/version' || path === '/api/health') return next()
  const pinHash = await getPinHash(c.env)
  if (!pinHash) return next() // not set up yet — allow so the first-run setup works
  const cookie = getCookie(c, AUTH_COOKIE)
  if (cookie && cookie === await sessionToken(pinHash)) return next()
  return c.json({ error: 'unauthorized' }, 401)
})

api.route('/api/auth', authRouter)

api.get('/api/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() })
)

api.get('/api/version', (c) =>
  c.json({
    version: c.env.APP_VERSION || 'dev',
    builtAt: null,
    minSupported: null,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY || null,
  })
)

api.route('/api/recipes', recipesRouter)
api.route('/api/plan', planRouter)
api.route('/api/settings', settingsRouter)
api.route('/api/shopping-lists', shoppingRouter)
api.route('/api/food-log', foodLogRouter)
api.route('/api/products', productsRouter)
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
    let res = await assets.fetch(request)

    if (res.status === 404) {
      const indexUrl = new URL('/index.html', url.origin)
      res = await assets.fetch(new Request(indexUrl.toString(), { headers: request.headers }))
    }

    // Never cache the service worker, the HTML shell, or the manifest, so the
    // browser always sees the latest version and can update the PWA. Hashed
    // JS/CSS assets keep their long-cache headers.
    const ct = res.headers.get('content-type') || ''
    const p = url.pathname
    if (
      p === '/sw.js' || p.endsWith('/sw.js') || p.startsWith('/workbox-') ||
      p === '/push-sw.js' || p.endsWith('.webmanifest') || p === '/' || p.endsWith('.html') ||
      ct.includes('text/html')
    ) {
      res = new Response(res.body, res)
      res.headers.set('Cache-Control', 'no-store, must-revalidate')
    }

    return res
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.VAPID_PRIVATE_KEY) return

    const db = getDb(env.DB)
    const subs = await db.select().from(push_subscriptions)
    if (subs.length === 0) return
    const allReminders = await db.select().from(reminders)
    if (allReminders.length === 0) return

    // Evaluate reminders in the user's timezone (reminder times are local).
    let tz = 'Europe/Warsaw'
    try {
      const [s] = await db.select().from(settings).where(eq(settings.key, 'app'))
      if (s) { const v = JSON.parse(s.value) as { timezone?: string }; if (v.timezone) tz = v.timezone }
    } catch { /* default tz */ }

    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }).formatToParts(now)
    const pget = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const nowMin = Number(pget('hour')) * 60 + Number(pget('minute'))
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const dow = wdMap[pget('weekday')] ?? now.getUTCDay()
    const todayKey = `${pget('year')}-${pget('month')}-${pget('day')}`

    for (const reminder of allReminders) {
      if (!reminder.enabled) continue
      const days = JSON.parse(reminder.days) as number[]
      if (!days.includes(dow)) continue

      const [rh, rm] = reminder.time.split(':').map(Number)
      const remMin = rh * 60 + rm
      // Fire once when the reminder falls within the current 15-minute cron
      // window (so times not aligned to :00/:15/:30/:45 still fire).
      const diff = nowMin - remMin
      if (diff < 0 || diff >= 15) continue

      // De-dupe: only one push per reminder per local day.
      if (reminder.last_fired_at) {
        const firedKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(reminder.last_fired_at * 1000))
        if (firedKey === todayKey) continue
      }

      await Promise.allSettled(
        subs.map(sub => sendPushNotification(env, sub.endpoint, sub.p256dh, sub.auth, {
          title: reminder.label,
          body: reminder.type === 'water' ? 'Pamiętaj o wypiciu wody 💧'
            : reminder.type === 'supplement' ? 'Czas na suplementy 💊'
            : reminder.type === 'cook' ? 'Czas gotować 🍲'
            : reminder.type === 'prep' ? 'Przygotuj jedzenie na jutro 🥘'
            : 'Przypomnienie 🌈',
          url: '/',
        }))
      )
      await db.update(reminders).set({ last_fired_at: Math.floor(Date.now() / 1000) })
        .where(eq(reminders.id, reminder.id))
    }
  },
} satisfies ExportedHandler<Env>
