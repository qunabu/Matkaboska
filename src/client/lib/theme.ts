import { useCallback, useState } from 'react'

export type Theme = 'dark' | 'light'
// v2: the SpaceX redesign makes black the default for everyone, including
// people who once picked light — their old choice is not carried over.
const KEY = 'mbl-theme-v2'

// SpaceX-style: dark is the default unless the user explicitly picked light.
export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', t === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#000000' : '#f7f7f7')
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  applyTheme(t)
}

// Called from main.tsx before React renders, to avoid a flash of the wrong theme.
export function initTheme() {
  // ?theme=light|dark picks a theme from a link (and remembers it).
  const q = new URLSearchParams(location.search).get('theme')
  if (q === 'light' || q === 'dark') setTheme(q)
  applyTheme(getTheme())
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, set] = useState<Theme>(getTheme)
  const toggle = useCallback(() => {
    set((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      setTheme(next)
      return next
    })
  }, [])
  return { theme, toggle }
}
