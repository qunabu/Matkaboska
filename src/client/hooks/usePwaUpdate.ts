import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const VERSION_CHECK_INTERVAL = 45 * 60 * 1000 // 45 min

export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true)
    },
    onRegistered(registration) {
      if (!registration) return

      // Periodic update check while the tab is open
      const timer = setInterval(() => {
        registration.update().catch(() => {})
      }, VERSION_CHECK_INTERVAL)

      return () => clearInterval(timer)
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error)
    },
  })

  const lastVersionRef = useRef<string | null>(null)

  useEffect(() => {
    async function checkServerVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { version: string }
        const serverVersion = data.version

        if (
          lastVersionRef.current &&
          serverVersion !== lastVersionRef.current &&
          serverVersion !== 'dev'
        ) {
          // Server has a newer version — trigger SW update check
          navigator.serviceWorker?.ready
            .then((reg) => reg.update())
            .catch(() => {})
          setNeedRefresh(true)
        }

        lastVersionRef.current = serverVersion
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

  return { needRefresh, updateServiceWorker }
}
