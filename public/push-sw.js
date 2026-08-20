// Imported by the Workbox-generated service worker (see vite.config.ts).
// Handles incoming Web Push messages, action buttons, and notification clicks.

// Buttons the server may put on a notification. Tapping one posts the answer to
// /api/push/action, so the item gets ticked off without opening the app.
const ACTIONS = ['done', 'yes', 'no', 'read']

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Matka Boska 🌈', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Matka Boska 🌈'
  const actions = Array.isArray(data.actions)
    ? data.actions.slice(0, 2).map((a) => ({ action: a.action, title: a.title }))
    : []
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/', act: data.act || null, nid: data.nid || null },
      tag: data.tag || 'mbl',
      actions,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const data = notification.data || {}
  const url = data.url || '/'

  if (ACTIONS.includes(event.action)) {
    notification.close()
    event.waitUntil(submitAction(event.action, data, notification.tag, url))
    return
  }

  notification.close()
  event.waitUntil(openApp(url))
})

// Post the answer and leave a short-lived receipt, so a tap that never opens the
// app still tells you whether it landed.
async function submitAction(action, data, tag, url) {
  const body = {
    action,
    nid: data.nid || undefined,
    kind: data.act ? data.act.kind : undefined,
    id: data.act ? data.act.id : undefined,
  }
  let ok = false
  try {
    const res = await fetch('/api/push/action', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    ok = res.ok
  } catch (e) {
    ok = false
  }

  if (!ok) {
    // Nothing was saved — keep it visible and make tapping it open the app.
    return self.registration.showNotification('Nie udało się zapisać 😕', {
      body: 'Otwórz aplikację i odhacz to ręcznie.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      tag: `${tag || 'mbl'}-err`,
    })
  }

  const label = action === 'no' ? 'Zapisane ✓' : action === 'read' ? 'Odhaczone ✓' : 'Zrobione ✓'
  await self.registration.showNotification(label, {
    body: 'Zapisane w Matce Boskiej 🌈',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url },
    tag: `${tag || 'mbl'}-ack`,
    silent: true,
  })
  await new Promise((r) => setTimeout(r, 4000))
  const acks = await self.registration.getNotifications({ tag: `${tag || 'mbl'}-ack` })
  acks.forEach((n) => n.close())
}

async function openApp(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of list) {
    if ('focus' in client) { client.navigate(url); return client.focus() }
  }
  if (self.clients.openWindow) return self.clients.openWindow(url)
}

// The browser may retire a subscription on its own (site data cleared, quota
// pressure, key rotation). Without this handler the app just goes quiet until
// someone re-enables notifications by hand.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe())
})

async function resubscribe() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return
    const { vapidPublicKey } = await res.json()
    if (!vapidPublicKey) return
    const sub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(vapidPublicKey),
    })
    const json = sub.toJSON()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: 'service-worker' }),
    })
  } catch (e) {
    // Nothing to do from here — the app re-syncs on next start.
  }
}

function base64UrlToBytes(b64) {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
