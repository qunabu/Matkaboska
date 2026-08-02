import { lazy, Suspense, useState, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { UpdateBanner, ForceUpdateScreen } from './components/UpdateBanner'
import { usePwaUpdate } from './hooks/usePwaUpdate'
import { useModuleSettings } from './lib/moduleSettings'
import { authApi, onboardingApi } from './lib/api'
import OnboardingPage from './pages/OnboardingPage'
import NotificationBell from './components/NotificationBell'
import { useTheme } from './lib/theme'
import pl from './i18n/pl'

declare const __APP_VERSION__: string

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

const TodayPage = lazy(() => import('./pages/TodayPage'))
const RecipesPage = lazy(() => import('./pages/RecipesPage'))
const RecipeDetailPage = lazy(() => import('./pages/RecipeDetailPage'))
const RecipeFormPage = lazy(() => import('./pages/RecipeFormPage'))
const PlanPage = lazy(() => import('./pages/PlanPage'))
const ShoppingPage = lazy(() => import('./pages/ShoppingPage'))
const TrackingPage = lazy(() => import('./pages/TrackingPage'))
const SupplementsPage = lazy(() => import('./pages/SupplementsPage'))
const ReminderPage = lazy(() => import('./pages/ReminderPage'))
const TodoPage = lazy(() => import('./pages/TodoPage'))
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const NotesPage = lazy(() => import('./pages/NotesPage'))
const PantryPage = lazy(() => import('./pages/PantryPage'))
const HabitsPage = lazy(() => import('./pages/HabitsPage'))
const ChoresPage = lazy(() => import('./pages/ChoresPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SharedListPage = lazy(() => import('./pages/SharedListPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center p-8 text-gray-400">
      {pl.common.loading}
    </div>
  )
}

// ── Bottom nav ───────────────────────────────────────────────────────────────

const ALL_NAV_ITEMS = [
  { to: '/',            label: pl.nav.today,       icon: '🏠',  moduleKey: null },
  { to: '/recipes',     label: pl.nav.recipes,     icon: '📖',  moduleKey: null },
  { to: '/plan',        label: pl.nav.plan,        icon: '📅',  moduleKey: 'plan' },
  { to: '/shopping',    label: pl.nav.shopping,    icon: '🛒',  moduleKey: 'shopping' },
  { to: '/pantry',      label: pl.nav.pantry,      icon: '🥫',  moduleKey: 'shopping' },
  { to: '/tracking',    label: pl.nav.tracking,    icon: '📊',  moduleKey: 'tracking' },
  { to: '/supplements', label: pl.nav.supplements, icon: '💊',  moduleKey: 'supplements' },
  { to: '/reminders',   label: pl.nav.reminders,   icon: '🔔',  moduleKey: 'supplements' },
  { to: '/chores',      label: pl.nav.chores,      icon: '🧹',  moduleKey: null },
  { to: '/todos',       label: pl.nav.todos,       icon: '✅',  moduleKey: null },
  { to: '/ideas',       label: pl.nav.ideas,       icon: '💡',  moduleKey: null },
  { to: '/habits',      label: pl.nav.habits,      icon: '🔁',  moduleKey: null },
  { to: '/notes',       label: pl.nav.notes,       icon: '🎙️', moduleKey: null },
  { to: '/help',        label: pl.nav.help,        icon: '❓',  moduleKey: null },
  { to: '/settings',    label: pl.nav.settings,    icon: '⚙️',  moduleKey: null },
]

function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const modules = useModuleSettings()

  const navItems = ALL_NAV_ITEMS.filter(i => !i.moduleKey || modules[i.moduleKey as keyof typeof modules])

  const primary = navItems.slice(0, 4)
  const overflow = navItems.slice(4) // tracking, supplements, reminders, settings
  const overflowActive = overflow.some((i) => location.pathname.startsWith(i.to))

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
      isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
    }`

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="glass absolute bottom-16 left-2 right-2 animate-fade-in-up space-y-0.5 rounded-2xl border p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {overflow.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    isActive
                      ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300'
                  }`
                }
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav
        aria-label="Nawigacja główna"
        className="glass fixed bottom-0 left-0 right-0 z-40 border-t md:hidden"
      >
        <div className="flex">
          {primary.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={`text-xl leading-none transition-transform ${isActive ? 'scale-110' : ''}`} aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              overflowActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <span className="text-xl leading-none" aria-hidden="true">☰</span>
            <span>{pl.nav.more}</span>
          </button>
        </div>
        <div className="h-safe-area-inset-bottom" />
      </nav>
    </>
  )
}

function SideNav() {
  const modules = useModuleSettings()
  const navItems = ALL_NAV_ITEMS.filter(i => !i.moduleKey || modules[i.moduleKey as keyof typeof modules])

  return (
    <aside className="glass hidden w-60 shrink-0 border-r md:flex md:flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
        <div>
          <span className="block text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">{pl.nav.appName}</span>
          <span className="block text-[10px] uppercase tracking-[0.18em] text-gray-400">{pl.nav.appTagline}</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary-600/10 text-primary-700 ring-1 ring-primary-600/20 dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-400/20'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100'
              }`
            }
          >
            <span className="text-base transition-transform group-hover:scale-110" aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

function TopBar() {
  const { theme, toggle } = useTheme()
  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b px-3 md:px-5">
      <div className="flex items-center gap-2 md:hidden">
        <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg ring-1 ring-black/5 dark:ring-white/10" />
        <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">{pl.nav.appName}</span>
      </div>
      <div className="hidden md:block text-xs font-medium uppercase tracking-[0.2em] text-gray-400">{pl.nav.appTagline}</div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? pl.theme.toLight : pl.theme.toDark}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
        >
          <span className="text-lg leading-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
        <NotificationBell />
      </div>
    </header>
  )
}

function AppShell() {
  const { needRefresh, updateServiceWorker } = usePwaUpdate()
  const [dismissed, setDismissed] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null)
  // Session-only: dismissing hides the install button until the next reload.
  const [installDismissed, setInstallDismissed] = useState(false)

  useEffect(() => {
    // The event may have already fired before React mounted (captured in
    // main.tsx and stashed on window); pick it up, and also listen live.
    const stashed = (window as unknown as { __installPrompt?: Event }).__installPrompt
    if (stashed) setInstallEvt(stashed as InstallPromptEvent)

    const onReady = () => {
      const e = (window as unknown as { __installPrompt?: Event }).__installPrompt
      if (e) setInstallEvt(e as InstallPromptEvent)
    }
    const onBIP = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallPromptEvent) }
    const onInstalled = () => setInstallEvt(null)
    window.addEventListener('installpromptready', onReady)
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('installpromptready', onReady)
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!installEvt) return
    await installEvt.prompt()
    await installEvt.userChoice.catch(() => {})
    setInstallEvt(null)
  }

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version, minSupported } = await res.json() as {
          version: string
          minSupported: string | null
        }
        if (
          minSupported &&
          version !== 'dev' &&
          __APP_VERSION__ !== 'dev' &&
          __APP_VERSION__ < minSupported
        ) {
          setForceUpdate(true)
        }
      } catch {
        // ignore
      }
    }
    check()
  }, [])

  async function handleUpdate() {
    await updateServiceWorker(true)
  }

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={handleUpdate} />
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <SideNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/new" element={<RecipeFormPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/plan/:weekStart" element={<PlanPage />} />
              <Route path="/shopping/*" element={<ShoppingPage />} />
              <Route path="/tracking/*" element={<TrackingPage />} />
              <Route path="/supplements/*" element={<SupplementsPage />} />
              <Route path="/reminders" element={<ReminderPage />} />
              <Route path="/todos" element={<TodoPage />} />
              <Route path="/ideas" element={<IdeasPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/pantry" element={<PantryPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/chores" element={<ChoresPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <BottomNav />
      {installEvt && !installDismissed && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 md:bottom-4">
          <button
            onClick={handleInstall}
            className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          >
            📲 {pl.common.installApp}
          </button>
          <button
            onClick={() => setInstallDismissed(true)}
            aria-label={pl.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800/85 text-white shadow-lg"
          >
            ✕
          </button>
        </div>
      )}
      {needRefresh && !dismissed && (
        <UpdateBanner
          onUpdate={handleUpdate}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </div>
  )
}

function LoginGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ['auth'], queryFn: authApi.me, retry: false })
  if (isLoading) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">{pl.common.loading}</div>
  }
  if (data?.authed) return <>{children}</>

  const err = new URLSearchParams(window.location.search).get('error')
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-50 p-6 dark:bg-gray-950">
      <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-2xl" />
      <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">{pl.auth.title}</h1>
      <p className="max-w-xs text-center text-sm text-gray-500 dark:text-gray-400">{pl.auth.googleHint}</p>
      {err && <p className="max-w-xs text-center text-sm text-red-500">{err}</p>}
      <a
        href="/api/auth/google"
        className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700"
      >
        <span aria-hidden="true">🔓</span> {pl.auth.google}
      </a>
    </div>
  )
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['onboarding-status'], queryFn: onboardingApi.status, retry: false })
  if (isLoading) {
    return <div className="flex h-dvh items-center justify-center text-gray-400">{pl.common.loading}</div>
  }
  if (data?.needsOnboarding) {
    return <OnboardingPage onDone={() => qc.invalidateQueries()} />
  }
  return <>{children}</>
}

function AppRoutes() {
  const location = useLocation()
  // Public, standalone shared shopping list — no login and no app shell, so a
  // share link opens for anyone who has the token.
  if (location.pathname.startsWith('/s/')) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/s/:token" element={<SharedListPage />} />
        </Routes>
      </Suspense>
    )
  }
  return (
    <LoginGate>
      <OnboardingGate>
        <AppShell />
      </OnboardingGate>
    </LoginGate>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
