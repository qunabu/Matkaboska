import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UpdateBanner, ForceUpdateScreen } from './components/UpdateBanner'
import { usePwaUpdate } from './hooks/usePwaUpdate'
import pl from './i18n/pl'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

// ── Placeholder screens ──────────────────────────────────────────────────────

function TodayScreen() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.today.title}</h1>
      <p className="text-gray-500">{pl.today.noMeals}</p>
    </div>
  )
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
      <p className="text-gray-500">Wkrótce…</p>
    </div>
  )
}

function SettingsScreen() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {pl.settings.title}
      </h1>
      <div className="space-y-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {pl.settings.about}
          </h2>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {pl.common.appVersion}: <span className="font-mono">{__APP_VERSION__}</span>
            </p>
          </div>
        </section>
      </div>
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

  // Show only 5 items on mobile, cycling based on current route
  const primaryItems = navItems.slice(0, 5)
  const isOverflow = navItems.slice(5).some((i) => location.pathname.startsWith(i.to))

  const displayItems = isOverflow
    ? [...navItems.slice(0, 4), navItems.find((i) => location.pathname.startsWith(i.to))!]
    : primaryItems

  return (
    <nav
      aria-label="Nawigacja główna"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:hidden"
    >
      <div className="flex">
        {displayItems.filter(Boolean).map((item) => (
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
            <span className="text-xl leading-none" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      {/* Safe area spacer for iOS home indicator */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}

function SideNav() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:flex md:flex-col">
      <div className="px-4 py-5">
        <span className="text-lg font-bold text-primary-600">🥗 Planer</span>
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

  // Check if server requires a forced update
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
          <Routes>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/recipes/*" element={<PlaceholderScreen title={pl.nav.recipes} />} />
            <Route path="/plan/*" element={<PlaceholderScreen title={pl.nav.plan} />} />
            <Route path="/shopping/*" element={<PlaceholderScreen title={pl.nav.shopping} />} />
            <Route path="/tracking/*" element={<PlaceholderScreen title={pl.nav.tracking} />} />
            <Route path="/supplements/*" element={<PlaceholderScreen title={pl.nav.supplements} />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
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
