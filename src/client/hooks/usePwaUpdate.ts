import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BUILD_VERSION } from '../../shared/build-info'

const VERSION_CHECK_INTERVAL = 15 * 60 * 1000 // 15 min

/**
 * Drop the service worker and everything it cached, then reload from the
 * network.
 *
 * This exists because vite-plugin-pwa's `updateServiceWorker()` is a no-op
 * under `registerType: 'autoUpdate'` — its implementation only sends the
 * skip-waiting message when auto mode is OFF:
 *
 *   const updateServiceWorker = async () => { await registerPromise
 *     if (!auto) sendSkipWaitingMessage?.() }
 *
 * So the update banner's button and the force-update screen did nothing at
 * all, and an installed PWA whose SW got stuck on an old build had no way out
 * short of reinstalling. Unregister + wipe caches + reload always lands on the
 * newest build: with no SW in control, index.html is fetched from the network
 * (it is served `no-store`) and a fresh SW registers on the next load.
 */
export async function forceAppUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
    }
  } catch {
    // keep going — clearing caches alone still helps
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    }
  } catch {
    // ignore
  }
  window.location.reload()
}

export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      setNeedRefresh(true)
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Periodic update check while the tab is open
      setInterval(() => {
        registration.update().catch(() => {})
      }, VERSION_CHECK_INTERVAL)
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error)
    },
  })

  // With autoUpdate + skipWaiting/clientsClaim the new SW takes control on its
  // own; reload once so the page picks up the fresh assets (no manual banner).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  useEffect(() => {
    async function checkServerVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version: serverVersion } = await res.json() as { version: string }

        // Worker and client assets ship from one build, so a mismatch means the
        // running page is stale — no need to first observe a change over time.
        if (serverVersion && serverVersion !== BUILD_VERSION && !serverVersion.startsWith('dev-')) {
          navigator.serviceWorker?.ready
            .then((reg) => reg.update())
            .catch(() => {})
          setNeedRefresh(true)
        }
      } catch {
        // Network unavailable — ignore
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkServerVersion()
        navigator.serviceWorker?.ready
          .then((reg) => reg.update())
          .catch(() => {})
      }
    }

    // Initial version check
    checkServerVersion()

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [setNeedRefresh])

  return { needRefresh, updateServiceWorker: forceAppUpdate }
}
