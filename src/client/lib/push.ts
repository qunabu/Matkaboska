import { pushApi } from './api'

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(sub: PushSubscription, vapidPublicKey: string): boolean {
  const applied = sub.options?.applicationServerKey
  if (!applied) return true // nothing to compare against — assume it is ours
  const a = new Uint8Array(applied)
  const b = urlBase64ToUint8Array(vapidPublicKey)
  if (a.length !== b.length) return false
  return a.every((byte, i) => byte === b[i])
}

export type PushSyncResult = 'ok' | 'unsupported' | 'no-permission' | 'not-configured' | 'error'

/**
 * Make sure the server holds a live subscription for this device.
 *
 * Safe to call on every app start: /push/subscribe upserts. This is what keeps
 * push from "turning itself off" — a browser that rotated or dropped the
 * subscription behind our back gets re-registered here instead of waiting for
 * someone to open Settings.
 */
export async function syncPushSubscription(): Promise<PushSyncResult> {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (Notification.permission !== 'granted') return 'no-permission'

  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return 'error'
    const { vapidPublicKey } = await res.json() as { vapidPublicKey?: string | null }
    if (!vapidPublicKey) return 'not-configured'

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    // A subscription signed with an older VAPID key can never be delivered to,
    // so trade it in rather than reporting success.
    if (sub && !sameKey(sub, vapidPublicKey)) {
      await sub.unsubscribe().catch(() => {})
      sub = null
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      })
    }
    await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON)
    return 'ok'
  } catch {
    return 'error'
  }
}
