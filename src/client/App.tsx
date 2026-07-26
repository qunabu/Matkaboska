import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UpdateBanner, ForceUpdateScreen } from './components/UpdateBanner'
import { usePwaUpdate } from './hooks/usePwaUpdate'
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
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center p-8 text-gray-400">
      {pl.common.loading}
    </div>
  )
}

// ── Bottom nav ───────────────────────────────────────────────────────────────

const navItems = [
  { to: '/',            label: pl.nav.today,       icon: '🏠' },
  { to: '/recipes',     label: pl.nav.recipes,     icon: '📖' },
  { to: '/plan',        label: pl.nav.plan,        icon: '📅' },
  { to: '/shopping',    label: pl.nav.shopping,    icon: '🛒' },
  { to: '/tracking',    label: pl.nav.tracking,    icon: '📊' },
  { to: '/supplements', label: pl.nav.supplements, icon: '💊' },
  { to: '/settings',    label: pl.nav.settings,    icon: '⚙️' },
]

function BottomNav() {
  const location = useLocation()

  const overflowItem = navItems.slice(5).find((i) => location.pathname.startsWith(i.to))
  const displayItems = overflowItem
    ? [...navItems.slice(0, 4), overflowItem]
    : navItems.slice(0, 5)

  return (
    <nav
      aria-label="Nawigacja główna"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:hidden"
    >
      <div className="flex">
        {displayItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`
            }
          >
            <span className="text-xl leading-none" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}

function SideNav() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:flex md:flex-col">
      <div className="px-4 py-5">
        <span className="block text-lg font-bold text-primary-600">🌈 {pl.nav.appName}</span>
        <span className="block text-xs text-gray-400">{pl.nav.appTagline}</span>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

function AppShell() {
  const { needRefresh, updateServiceWorker } = usePwaUpdate()
  const [dismissed, setDismissed] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)

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
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/new" element={<RecipeFormPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
              <Route path="/plan/*" element={<PlanPage />} />
              <Route path="/shopping/*" element={<ShoppingPage />} />
              <Route path="/tracking/*" element={<TrackingPage />} />
              <Route path="/supplements/*" element={<SupplementsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <BottomNav />
      {needRefresh && !dismissed && (
        <UpdateBanner
          onUpdate={handleUpdate}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
