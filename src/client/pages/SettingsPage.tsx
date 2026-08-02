import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, pushApi, productsApi, authApi } from '../lib/api'
import { MODULE_KEYS, getModuleSettings, setModuleSetting } from '../lib/moduleSettings'
import { soundEnabled, setSoundEnabled } from '../lib/sound'
import { useTheme } from '../lib/theme'
import pl from '../i18n/pl'

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function ProductsRepo() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() })
  const del = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
  const items = data?.items ?? []
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {pl.settings.products}
      </h2>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">{pl.settings.productsEmpty}</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {items.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {[
                      p.kcal != null ? `${Math.round(p.kcal)} kcal/100g` : null,
                      p.protein_g != null ? `${Math.round(p.protein_g)}g B` : null,
                      p.carbs_g != null ? `${Math.round(p.carbs_g)}g W` : null,
                      p.fat_g != null ? `${Math.round(p.fat_g)}g T` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {(p.serving_g != null || p.package_g != null) && (
                    <p className="text-xs text-gray-400">
                      {[
                        p.serving_g != null ? `porcja ${p.serving_g} g` : null,
                        p.package_g != null ? `opak. ${p.package_g} g` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => del.mutate(p.id)}
                  className="shrink-0 text-gray-300 hover:text-red-400"
                  aria-label={pl.common.delete}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function IntegrationsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['integrations'], queryFn: () => settingsApi.integrations() })
  const [username, setUsername] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [password, setPassword] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) {
      setUsername(data.frisco.username || '')
      setWarehouse(data.frisco.warehouse || '')
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => settingsApi.updateIntegrations({
      frisco: { username, warehouse, ...(password ? { password } : {}) },
      ...(anthropicKey ? { anthropic_api_key: anthropicKey } : {}),
    }),
    onSuccess: () => {
      setPassword(''); setAnthropicKey('')
      qc.invalidateQueries({ queryKey: ['integrations'] })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    },
  })

  const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const passPlaceholder = data?.frisco.hasPassword ? pl.settings.secretPlaceholder : pl.settings.secretEmpty
  const keyPlaceholder = data?.anthropic.hasKey ? pl.settings.secretPlaceholder : pl.settings.secretEmpty

  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.settings.integrations}</h2>
      <p className="mb-3 text-xs text-gray-400">{pl.settings.integrationsHint}</p>
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{pl.settings.friscoLogin}</label>
          <input className={field} type="email" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{pl.settings.friscoPassword}</label>
          <input className={field} type="password" autoComplete="new-password" placeholder={passPlaceholder} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{pl.settings.friscoWarehouse}</label>
          <input className={field} type="text" autoComplete="off" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{pl.settings.anthropicKey}</label>
          <input className={field} type="password" autoComplete="off" placeholder={keyPlaceholder} value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className={`w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors ${saved ? 'bg-green-500' : 'bg-primary-600 hover:bg-primary-700'} disabled:opacity-50`}
        >
          {saved ? `✓ ${pl.settings.saved}` : pl.common.save}
        </button>
      </div>
    </section>
  )
}

declare const __APP_VERSION__: string

// Version is "<git-sha>-<unix-seconds>"; split off the build time as a date.
function parseVersion(v: string): { sha: string; when: string | null } {
  const i = v.lastIndexOf('-')
  const ts = i >= 0 ? Number(v.slice(i + 1)) : NaN
  if (!Number.isFinite(ts) || ts < 1_000_000_000) return { sha: v, when: null }
  const when = new Date(ts * 1000).toLocaleString('pl-PL', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return { sha: v.slice(0, i), when }
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [notifState, setNotifState] = useState<'default' | 'granted' | 'denied'>('default')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<'sent' | 'denied' | 'error' | 'unsupported' | null>(null)
  const [moduleSettings, setModuleSettings] = useState(getModuleSettings)
  const { theme, toggle: toggleTheme } = useTheme()
  const [sound, setSound] = useState(soundEnabled)

  useEffect(() => {
    if ('Notification' in window) {
      setNotifState(Notification.permission as typeof notifState)
    }
    fetch('/api/version').then(r => r.json()).then((d: { vapidPublicKey?: string }) => {
      if (d.vapidPublicKey) setVapidKey(d.vapidPublicKey)
    }).catch(() => {})
  }, [])

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  })

  const [kcalTarget, setKcalTarget] = useState(settings?.kcal_target ?? 2300)
  const [proteinTarget, setProteinTarget] = useState(settings?.protein_g_target ?? 150)
  const [waterTarget, setWaterTarget] = useState(settings?.water_glasses_target ?? 8)

  useEffect(() => {
    if (settings) {
      setKcalTarget(settings.kcal_target)
      setProteinTarget(settings.protein_g_target)
      setWaterTarget(settings.water_glasses_target)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.update({
      kcal_target: kcalTarget,
      protein_g_target: proteinTarget,
      water_glasses_target: waterTarget,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  async function ensureSubscription(pubKey: string) {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey).buffer as ArrayBuffer,
      })
    }
    await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON)
  }

  // Register a push subscription automatically once permission is granted and
  // the server VAPID public key is known.
  useEffect(() => {
    if (notifState === 'granted' && vapidKey) {
      ensureSubscription(vapidKey).catch((err) => console.error('Auto-subscribe failed', err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifState, vapidKey])

  async function enableNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    const perm = await Notification.requestPermission()
    setNotifState(perm as typeof notifState)
    if (perm !== 'granted' || !vapidKey) return

    try {
      await ensureSubscription(vapidKey)
    } catch (err) {
      console.error('Push subscribe failed', err)
    }
  }

  async function sendTestNotification() {
    setTestMsg(null)
    if (!('Notification' in window)) { setTestMsg('unsupported'); return }
    try {
      let perm = Notification.permission
      if (perm !== 'granted') {
        perm = await Notification.requestPermission()
        setNotifState(perm as typeof notifState)
      }
      if (perm !== 'granted') { setTestMsg('denied'); return }

      // Show a real notification locally via the service worker — this works
      // whenever permission is granted, independent of server push / VAPID.
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification('Matka Boska 🌈', {
          body: 'Powiadomienia działają! 🙏',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'mbl-test',
        })
      } else {
        new Notification('Matka Boska 🌈', { body: 'Powiadomienia działają! 🙏', icon: '/icons/icon-192.png' })
      }
      setTestMsg('sent')
      // Best-effort server push too (for real cron reminders, if VAPID is set).
      pushApi.test().catch(() => {})
    } catch (err) {
      console.error('Test notification failed', err)
      setTestMsg('error')
    }
  }

  if (isLoading) return <div className="p-4 text-gray-500">{pl.common.loading}</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.settings.title}</h1>

      <div className="space-y-6">
        {/* Targets */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {pl.settings.targets}
          </h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {[
                { label: pl.settings.kcal, value: kcalTarget, setter: setKcalTarget, min: 500, max: 5000, step: 50 },
                { label: pl.settings.protein, value: proteinTarget, setter: setProteinTarget, min: 20, max: 400, step: 5 },
                { label: pl.settings.water, value: waterTarget, setter: setWaterTarget, min: 1, max: 20, step: 1 },
              ].map(({ label, value, setter, min, max, step }) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setter(Math.max(min, value - step))}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700"
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {value}
                    </span>
                    <button
                      onClick={() => setter(Math.min(max, value + step))}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className={`mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors ${
              saved ? 'bg-green-500' : 'bg-primary-600 hover:bg-primary-700'
            } disabled:opacity-50`}
          >
            {saved ? `✓ ${pl.settings.saved}` : pl.common.save}
          </button>
        </section>

        {/* Appearance & sound */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {pl.settings.appearance}
          </h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              <div className="flex items-center justify-between px-4 py-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {theme === 'dark' ? pl.theme.toLight : pl.theme.toDark}
                </label>
                <Toggle checked={theme === 'dark'} onChange={toggleTheme} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{pl.theme.sound}</label>
                <Toggle checked={sound} onChange={() => { const next = !sound; setSound(next); setSoundEnabled(next) }} />
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {pl.settings.notifications}
          </h2>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            {notifState === 'granted' ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-600 dark:text-green-400">✓ {pl.settings.notificationsGranted}</p>
                <button
                  onClick={sendTestNotification}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700"
                >
                  {pl.settings.testNotification}
                </button>
              </div>
            ) : notifState === 'denied' ? (
              <p className="text-sm text-red-500">{pl.settings.notificationsDenied}</p>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={enableNotifications}
                  className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white"
                >
                  🔔 {pl.settings.enableNotifications}
                </button>
                <button
                  onClick={sendTestNotification}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700"
                >
                  {pl.settings.testNotification}
                </button>
              </div>
            )}
            {testMsg && (
              <p className={`mt-3 text-xs ${testMsg === 'sent' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {testMsg === 'sent' ? pl.settings.testSent
                  : testMsg === 'denied' ? pl.settings.testDenied
                  : testMsg === 'unsupported' ? pl.settings.testUnsupported
                  : pl.settings.testError}
              </p>
            )}
          </div>
        </section>

        {/* Per-user integrations (Frisco creds, Anthropic key) */}
        <IntegrationsSection />

        {/* Products repository */}
        <ProductsRepo />

        {/* Modules */}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {pl.settings.modules}
          </h2>
          <p className="mb-3 text-xs text-gray-400">{pl.settings.modulesHint}</p>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {MODULE_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {pl.settings.moduleLabels[key]}
                  </label>
                  <button
                    role="switch"
                    aria-checked={moduleSettings[key]}
                    onClick={() => {
                      const next = setModuleSetting(key, !moduleSettings[key])
                      setModuleSettings(next)
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      moduleSettings[key]
                        ? 'bg-primary-600'
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        moduleSettings[key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {pl.settings.about}
          </h2>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            {(() => {
              const v = parseVersion(__APP_VERSION__)
              return (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {pl.common.appVersion}: <span className="font-mono">{v.sha}</span>
                  </p>
                  {v.when && (
                    <p className="mt-1 text-xs text-gray-400">{pl.settings.built}: {v.when}</p>
                  )}
                </>
              )
            })()}
          </div>
          <button
            onClick={async () => { await authApi.logout().catch(() => {}); window.location.reload() }}
            className="mt-3 w-full rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          >
            🔒 {pl.auth.logout}
          </button>
        </section>
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
