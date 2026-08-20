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
import { settingsRouter, getSettings } from './routes/settings'
import { shoppingRouter } from './routes/shopping'
import { sharedListRouter } from './routes/shared-list'
import { foodLogRouter } from './routes/food-log'
import { productsRouter } from './routes/products'
import { waterRouter } from './routes/water'
import { supplementsRouter } from './routes/supplements'
import { pushRouter, notify } from './routes/push'
import type { PushPayload } from './routes/push'
import { notificationsRouter } from './routes/notifications'
import { friscoRouter } from './routes/frisco'
import { todosRouter } from './routes/todos'
import { ideasRouter } from './routes/ideas'
import { voiceNotesRouter } from './routes/voice-notes'
import { pantryRouter } from './routes/pantry'
import { habitsRouter, getHabitState, localDateKey } from './routes/habits'
import { choresRouter, choreDue } from './routes/chores'
import { budzetRouter } from './routes/budzet'
import { habits, chores } from './db/index'
import { getDb, reminders, push_subscriptions, settings, supplements, supplement_log } from './db/index'
import { eq, and } from 'drizzle-orm'
import type { Env } from './types'
import type { Db } from './db/index'
import { DEFAULT_SETTINGS } from '../shared/types'

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
api.route('/api/budzet', budzetRouter)

type AssetsBinding = { fetch: (r: Request) => Promise<Response> }

type BatchItem = { payload: PushPayload; commit: () => Promise<void> }

/** How many notifications one batch may put on the phone at once. */
const MAX_PER_BATCH = 5

/** True while the local clock sits inside the user's quiet window (wraps midnight). */
function inQuietHours(nowMin: number, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const s = toMin(start)
  const e = toMin(end)
  return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e
}

// When the last batch went out. Kept in its own settings bucket ('push_state')
// so cron writes never race the user editing their app settings.
async function readLastBatchAt(db: Db, userId: string): Promise<number | null> {
  try {
    const [row] = await db.select().from(settings)
      .where(and(eq(settings.user_id, userId), eq(settings.key, 'push_state')))
    if (!row) return null
    const v = JSON.parse(row.value) as { last_batch_at?: number }
    return typeof v.last_batch_at === 'number' ? v.last_batch_at : null
  } catch { return null }
}

async function writeLastBatchAt(db: Db, userId: string, at: number): Promise<void> {
  const value = JSON.stringify({ last_batch_at: at })
  await db.insert(settings)
    .values({ user_id: userId, key: 'push_state', value })
    .onConflictDoUpdate({ target: [settings.user_id, settings.key], set: { value } })
}

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
    const nowUnix = Math.floor(Date.now() / 1000)

    for (const userId of userIds) {
      const subs = allSubs.filter((s) => s.user_id === userId)
      const cfg = await getSettings(env, userId)
      const tz = cfg.timezone || 'Europe/Warsaw'

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

      // Two gates decide whether the phone buzzes at all. Nothing is marked as
      // fired while a gate holds, so a due item just waits for the next batch
      // instead of being lost.
      if (inQuietHours(nowMin, cfg.quiet_hours_start, cfg.quiet_hours_end)) continue
      const intervalMin = Math.max(0, cfg.notify_interval_min ?? DEFAULT_SETTINGS.notify_interval_min)
      const lastBatchAt = await readLastBatchAt(db, userId)
      if (intervalMin > 0 && lastBatchAt && (nowUnix - lastBatchAt) / 60 < intervalMin) continue

      const batch: BatchItem[] = []

      const allReminders = await db.select().from(reminders).where(eq(reminders.user_id, userId))
      for (const reminder of allReminders) {
        if (!reminder.enabled) continue
        const days = JSON.parse(reminder.days) as number[]
        if (!days.includes(dow)) continue

        const [rh, rm] = reminder.time.split(':').map(Number)
        // No upper bound on how late it may fire: a reminder held back by the
        // batch window still belongs in the next batch, not in the bin.
        if (nowMin < rh * 60 + rm) continue

        if (reminder.last_fired_at) {
          const firedKey = localDateKey(tz, new Date(reminder.last_fired_at * 1000))
          if (firedKey === todayKey) continue
        }

        const isWater = reminder.type === 'water'
        batch.push({
          payload: {
            title: reminder.label,
            body: isWater ? 'Pamiętaj o wypiciu wody 💧'
              : reminder.type === 'supplement' ? 'Czas na suplementy 💊'
              : reminder.type === 'cook' ? 'Czas gotować 🍲'
              : reminder.type === 'prep' ? 'Przygotuj jedzenie na jutro 🥘'
              : 'Przypomnienie 🌈',
            url: '/',
            tag: `rem-${reminder.id}`,
            actions: isWater
              ? [{ action: 'done', title: '💧 +1 szklanka' }]
              : [{ action: 'read', title: '✓ OK' }],
            act: isWater ? { kind: 'water', id: 0 } : undefined,
          },
          commit: async () => {
            await db.update(reminders).set({ last_fired_at: nowUnix }).where(eq(reminders.id, reminder.id))
          },
        })
      }

      // Per-item nag floors still apply, but never tighter than the batch
      // window — that window is the user's stated tolerance.
      const supNag = Math.max(30, intervalMin)
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

        if (sup.last_notified_at && (nowUnix - sup.last_notified_at) / 60 < supNag) continue

        batch.push({
          payload: {
            title: sup.name,
            body: sup.kind === 'medication'
              ? 'Czas na lek 💊 — potwierdź przyciskiem poniżej'
              : 'Czas na suplement 💊 — potwierdź przyciskiem poniżej',
            url: '/supplements',
            tag: `sup-${sup.id}`,
            actions: [{ action: 'done', title: '💊 Przyjąłem' }],
            act: { kind: 'supplement', id: sup.id },
          },
          commit: async () => {
            await db.update(supplements).set({ last_notified_at: nowUnix }).where(eq(supplements.id, sup.id))
          },
        })
      }

      const allHabits = await db.select().from(habits).where(eq(habits.user_id, userId))
      for (const h of allHabits) {
        if (!h.active) continue
        if (h.prompt_date !== todayKey) {
          // Fixed time if the habit has one, otherwise a random minute in the window.
          let minute: number
          if (h.remind_at) {
            const [fh, fm] = h.remind_at.split(':').map(Number)
            minute = fh * 60 + fm
          } else {
            const lo = h.window_start ?? 540
            const hi = Math.max(lo + 1, h.window_end ?? 1260)
            minute = lo + Math.floor(Math.random() * (hi - lo))
          }
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
          : 'Czy dziś się udało? Odpowiedz przyciskiem poniżej.'
        batch.push({
          payload: {
            title: h.name,
            body,
            url: '/habits',
            tag: `habit-${h.id}`,
            actions: [
              { action: 'yes', title: '✅ Tak' },
              { action: 'no', title: '❌ Nie' },
            ],
            act: { kind: 'habit', id: h.id },
          },
          commit: async () => {
            await db.update(habits).set({ prompted: true }).where(eq(habits.id, h.id))
          },
        })
      }

      const choreCtx = { tz, todayKey, dow, nowMin }
      const allChores = await db.select().from(chores).where(eq(chores.user_id, userId))
      for (const ch of allChores) {
        if (!ch.active) continue
        const { due } = choreDue(ch, choreCtx)
        if (!due) continue
        const choreNag = Math.max(ch.nag_minutes, intervalMin)
        if (ch.last_notified_at && (nowUnix - ch.last_notified_at) / 60 < choreNag) continue
        batch.push({
          payload: {
            title: ch.name,
            body: 'Czas na to zadanie ✅ — potwierdź przyciskiem poniżej',
            url: '/chores',
            tag: `chore-${ch.id}`,
            actions: [{ action: 'done', title: '✅ Zrobione' }],
            act: { kind: 'chore', id: ch.id },
          },
          commit: async () => {
            await db.update(chores).set({ last_notified_at: nowUnix }).where(eq(chores.id, ch.id))
          },
        })
      }

      if (batch.length === 0) continue

      // Cap the burst: what does not fit stays uncommitted, so it leads the
      // next batch instead of burying the phone under a wall of cards.
      const sending = batch.slice(0, MAX_PER_BATCH)
      for (const item of sending) {
        await notify(env, userId, subs, item.payload)
        await item.commit()
      }
      const overflow = batch.length - sending.length
      if (overflow > 0) {
        await notify(env, userId, subs, {
          title: `…i jeszcze ${overflow}`,
          body: 'Otwórz aplikację, żeby zobaczyć resztę 🌈',
          url: '/',
          tag: 'mbl-overflow',
          actions: [{ action: 'read', title: '✓ OK' }],
        })
      }
      await writeLastBatchAt(db, userId, nowUnix)
    }
  },
} satisfies ExportedHandler<Env>
