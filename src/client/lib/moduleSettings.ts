import { useState, useEffect } from 'react'

export const MODULE_KEYS = ['plan', 'shopping', 'tracking', 'supplements'] as const
export type ModuleKey = typeof MODULE_KEYS[number]

export type ModuleSettings = Record<ModuleKey, boolean>

const LS_KEY = 'module-visibility'

const defaults: ModuleSettings = {
  plan: true,
  shopping: true,
  tracking: true,
  supplements: true,
}

export function getModuleSettings(): ModuleSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...defaults }
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return { ...defaults }
  }
}

export function setModuleSetting(key: ModuleKey, enabled: boolean): ModuleSettings {
  const next = { ...getModuleSettings(), [key]: enabled }
  localStorage.setItem(LS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('module-settings-changed'))
  return next
}

export function useModuleSettings() {
  const [settings, setSettings] = useState<ModuleSettings>(getModuleSettings)

  useEffect(() => {
    const sync = () => setSettings(getModuleSettings())
    window.addEventListener('module-settings-changed', sync)
    return () => window.removeEventListener('module-settings-changed', sync)
  }, [])

  return settings
}
