import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, pushApi, productsApi } from '../lib/api'
import pl from '../i18n/pl'

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
                      p.portion,
                      p.kcal != null ? `${Math.round(p.kcal)} kcal` : null,
                      p.protein_g != null ? `${Math.round(p.protein_g)}g B` : null,
                      p.carbs_g != null ? `${Math.round(p.carbs_g)}g W` : null,
                      p.fat_g != null ? `${Math.round(p.fat_g)}g T` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
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

declare const __APP_VERSION__: string

export default function SettingsPage() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [notifState, setNotifState] = useState<'default' | 'granted' | 'denied'>('default')
  const [vapidKey, setVapidKey] = useState<string | null>(null)

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

  async function enableNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    const perm = await Notification.requestPermission()
    setNotifState(perm as typeof notifState)
    if (perm !== 'granted') return

    try {
      const reg = await navigator.serviceWorker.ready
      const pubKey = vapidKey ?? ''
      if (!pubKey) return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey).buffer as ArrayBuffer,
      })
      await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON)
    } catch (err) {
      console.error('Push subscribe failed', err)
    }
  }

  async function sendTestNotification() {
    await pushApi.test()
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
              <button
                onClick={enableNotifications}
                className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white"
              >
                🔔 {pl.settings.enableNotifications}
              </button>
            )}
          </div>
        </section>

        {/* Products repository */}
        <ProductsRepo />

        {/* About */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
