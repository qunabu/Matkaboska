import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types'
import { BUILD_SHA, BUILD_VERSION, BUILT_AT } from '../shared/build-info'
import { accessAuth } from './middleware/auth'
import { authRouter } from './routes/auth'
import { onboardingRouter } from './routes/onboarding'
import { adminRouter } from './routes/admin'
import { recipesRouter } from './routes/recipes'
import { planRouter } from './routes/plan'
import { settingsRouter } from './routes/settings'
import { shoppingRouter } from './routes/shopping'
import { sharedListRouter } from './routes/shared-list'
import { foodLogRouter } from './routes/food-log'
import { productsRouter } from './routes/products'
import { waterRouter } from './routes/water'
import { supplementsRouter } from './routes/supplements'
import { pushRouter, notify } from './routes/push'
import { notificationsRouter } from './routes/notifications'
import { friscoRouter } from './routes/frisco'
import { todosRouter } from './routes/todos'
import { ideasRouter } from './routes/ideas'
import { voiceNotesRouter } from './routes/voice-notes'
import { pantryRouter } from './routes/pantry'
import { habitsRouter, getHabitState } from './routes/habits'
import { choresRouter, choreDue } from './routes/chores'
import { habits, chores } from './db/index'
import { getDb, reminders, push_subscriptions, settings, supplements, supplement_log } from './db/index'
import { eq, and } from 'drizzle-orm'
import type { Env } from './types'

const api = new Hono<AppEnv>()

api.use('*', cors())
api.use('*', accessAuth)

// Shared shopping list — any authenticated user with the token can view/add items
api.route('/api/s', sharedListRouter)

api.route('/api/auth', authRouter)
api.route('/api/onboarding', onboardingRouter)
api.route('/api/admin', adminRouter)
api.route('/api/notifications', notificationsRouter)

api.get('/api/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() })
)

api.get('/api/version', (c) =>
  c.json({
    version: BUILD_VERSION,
    sha: BUILD_SHA,
    builtAt: BUILT_AT,
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
api.route('/api/frisco', friscoRouter)
api.route('/api/todos', todosRouter)
api.route('/api/ideas', ideasRouter)
api.route('/api/voice-notes', voiceNotesRouter)
api.route('/api/pantry', pantryRouter)
api.route('/api/habits', habitsRouter)
api.route('/api/chores', choresRouter)

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

    // Get distinct users who have push subscriptions
    const allSubs = await db.select().from(push_subscriptions)
    if (allSubs.length === 0) return

    const userIds = [...new Set(allSubs.map((s) => s.user_id))]

    for (const userId of userIds) {
      const subs = allSubs.filter((s) => s.user_id === userId)

      // Get user timezone from their settings
      let tz = 'Europe/Warsaw'
      try {
        const [s] = await db.select().from(settings)
          .where(and(eq(settings.user_id, userId), eq(settings.key, 'app')))
        if (s) {
          const v = JSON.parse(s.value) as { timezone?: string }
          if (v.timezone) tz = v.timezone
        }
      } catch { /* use default */ }

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

      const allReminders = await db.select().from(reminders).where(eq(reminders.user_id, userId))
      for (const reminder of allReminders) {
        if (!reminder.enabled) continue
        const days = JSON.parse(reminder.days) as number[]
        if (!days.includes(dow)) continue

        const [rh, rm] = reminder.time.split(':').map(Number)
        const remMin = rh * 60 + rm
        const diff = nowMin - remMin
        if (diff < 0 || diff >= 15) continue

        if (reminder.last_fired_at) {
          const firedKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date(reminder.last_fired_at * 1000))
          if (firedKey === todayKey) continue
        }

        await notify(env, userId, subs, {
          title: reminder.label,
          body: reminder.type === 'water' ? 'Pamiętaj o wypiciu wody 💧'
            : reminder.type === 'supplement' ? 'Czas na suplementy 💊'
            : reminder.type === 'cook' ? 'Czas gotować 🍲'
            : reminder.type === 'prep' ? 'Przygotuj jedzenie na jutro 🥘'
            : 'Przypomnienie 🌈',
          url: '/',
        })
        await db.update(reminders).set({ last_fired_at: Math.floor(Date.now() / 1000) })
          .where(eq(reminders.id, reminder.id))
      }

      const NAG_MIN = 30
      const nowUnix = Math.floor(Date.now() / 1000)
      const logDateKey = new Date().toISOString().slice(0, 10)
      const allSupps = await db.select().from(supplements).where(eq(supplements.user_id, userId))
      for (const sup of allSupps) {
        if (!sup.active) continue
        let sched: { times?: string[]; days?: number[] }
        try { sched = JSON.parse(sup.schedule) } catch { continue }
        const times = sched.times ?? []
        const days = sched.days ?? [0, 1, 2, 3, 4, 5, 6]
        if (times.length === 0 || !days.includes(dow)) continue

        const dueByNow = times.filter((t) => {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m <= nowMin
        }).length
        if (dueByNow === 0) continue
        const takenRows = await db.select().from(supplement_log)
          .where(and(eq(supplement_log.supplement_id, sup.id), eq(supplement_log.date, logDateKey)))
        if (takenRows.length >= dueByNow) continue

        if (sup.last_notified_at && (nowUnix - sup.last_notified_at) / 60 < NAG_MIN) continue

        await notify(env, userId, subs, {
          title: sup.name,
          body: sup.kind === 'medication'
            ? 'Czas na lek 💊 — kliknij „Przyjmij", gdy weźmiesz'
            : 'Czas na suplement 💊 — kliknij „Przyjmij", gdy weźmiesz',
          url: '/supplements',
          tag: `sup-${sup.id}`,
        })
        await db.update(supplements).set({ last_notified_at: nowUnix }).where(eq(supplements.id, sup.id))
      }

      const allHabits = await db.select().from(habits).where(eq(habits.user_id, userId))
      for (const h of allHabits) {
        if (!h.active) continue
        if (h.prompt_date !== todayKey) {
          const lo = h.window_start ?? 540
          const hi = Math.max(lo + 1, h.window_end ?? 1260)
          const minute = lo + Math.floor(Math.random() * (hi - lo))
          await db.update(habits).set({ prompt_date: todayKey, prompt_minute: minute, prompted: false }).where(eq(habits.id, h.id))
          h.prompt_minute = minute
          h.prompted = false
        }
        if (h.prompted) continue
        if (nowMin < (h.prompt_minute ?? 0)) continue

        const st = await getHabitState(db, h.id, todayKey)
        if (st.today !== null) {
          await db.update(habits).set({ prompted: true }).where(eq(habits.id, h.id))
          continue
        }
        const body = st.streak > 0
          ? `Już ${st.streak} ${st.streak === 1 ? 'dzień' : 'dni'} 🔥 — czy dziś też się udało?`
          : 'Czy dziś się udało? Kliknij, aby odpowiedzieć.'
        await notify(env, userId, subs, {
          title: h.name,
          body,
          url: '/habits',
          tag: `habit-${h.id}`,
        })
        await db.update(habits).set({ prompted: true }).where(eq(habits.id, h.id))
      }

      const choreCtx = { tz, todayKey, dow, nowMin }
      const allChores = await db.select().from(chores).where(eq(chores.user_id, userId))
      for (const ch of allChores) {
        if (!ch.active) continue
        const { due } = choreDue(ch, choreCtx)
        if (!due) continue
        if (ch.last_notified_at && (nowUnix - ch.last_notified_at) / 60 < ch.nag_minutes) continue
        await notify(env, userId, subs, {
          title: ch.name,
          body: 'Czas na to zadanie ✅ — kliknij „Zrobione", gdy skończysz',
          url: '/chores',
          tag: `chore-${ch.id}`,
        })
        await db.update(chores).set({ last_notified_at: nowUnix }).where(eq(chores.id, ch.id))
      }
    }
  },
} satisfies ExportedHandler<Env>
