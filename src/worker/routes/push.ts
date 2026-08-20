import { Hono } from 'hono'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import {
  getDb, push_subscriptions, reminders, notifications, settings,
  chores, supplements, supplement_log, habits, habit_checkins, water_log,
} from '../db/index'
import { localDateKey, appTimezone } from './habits'
import type { AppEnv, Env } from '../types'

type PushSub = { endpoint: string; p256dh: string; auth: string }

/** A rejected push, with the status the push service returned. */
export class PushError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** A button rendered inside the notification itself (Android/Chrome, desktop). */
export type PushAction = { action: string; title: string }

/**
 * What an action button acts on. The service worker never calls a domain
 * endpoint directly — it posts this back to /api/push/action, so the mutation
 * (and the auth check behind it) stays server-side.
 */
export type PushActTarget = { kind: 'chore' | 'supplement' | 'habit' | 'water'; id: number }

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  actions?: PushAction[]
  act?: PushActTarget
  /** notifications-feed row id — filled in by notify() so an action can mark it read. */
  nid?: number
}

const app = new Hono<AppEnv>()

// POST /api/push/subscribe
app.post('/subscribe', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
    userAgent: z.string().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { endpoint, keys, userAgent } = parsed.data
  const db = getDb(c.env.DB)

  await db.insert(push_subscriptions)
    .values({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? null })
    .onConflictDoUpdate({
      target: [push_subscriptions.user_id, push_subscriptions.endpoint],
      set: { p256dh: keys.p256dh, auth: keys.auth },
    })

  return c.json({ ok: true })
})

// DELETE /api/push/unsubscribe
app.delete('/unsubscribe', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const { endpoint } = z.object({ endpoint: z.string() }).parse(body)
  const db = getDb(c.env.DB)
  await db.delete(push_subscriptions)
    .where(and(eq(push_subscriptions.user_id, userId), eq(push_subscriptions.endpoint, endpoint)))
  return c.json({ ok: true })
})

// POST /api/push/test
app.post('/test', async (c) => {
  if (!c.env.VAPID_PRIVATE_KEY) return c.json({ error: 'Push not configured' }, 503)
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const subs = await db.select().from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  if (subs.length === 0) return c.json({ error: 'No subscriptions' }, 400)

  const payload: PushPayload = {
    title: 'Matka Boska 🌈',
    body: 'Powiadomienia działają! 🙏 Sprawdź przycisk poniżej.',
    url: '/',
    actions: [{ action: 'read', title: '✓ Przeczytane' }],
  }
  await db.insert(notifications).values({ user_id: userId, title: payload.title, body: payload.body, url: payload.url, read_at: null }).catch(() => {})
  const { sent, dropped, errors } = await deliver(c.env, userId, subs, payload)
  return c.json({ sent, total: subs.length, dropped, errors })
})

// GET /api/push/status — what the server actually holds for this account.
// Zero devices is the usual reason "push stopped working" with no error anywhere.
app.get('/status', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const subs = await db.select().from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  let lastBatchAt: number | null = null
  try {
    const [row] = await db.select().from(settings)
      .where(and(eq(settings.user_id, userId), eq(settings.key, 'push_state')))
    if (row) {
      const v = JSON.parse(row.value) as { last_batch_at?: number }
      lastBatchAt = typeof v.last_batch_at === 'number' ? v.last_batch_at : null
    }
  } catch { /* no state yet */ }
  return c.json({
    configured: Boolean(c.env.VAPID_PRIVATE_KEY),
    devices: subs.length,
    lastBatchAt,
    subscriptions: subs.map((s) => ({ id: s.id, userAgent: s.user_agent, createdAt: s.created_at })),
  })
})

// GET /api/reminders
app.get('/reminders', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const rows = await db.select().from(reminders)
    .where(eq(reminders.user_id, userId))
    .orderBy(reminders.time)
  const items = rows.map(r => ({ ...r, days: JSON.parse(r.days) as number[] }))
  return c.json({ items, total: items.length })
})

// POST /api/reminders
app.post('/reminders', async (c) => {
  const userId = c.var.userId
  const body = await c.req.json()
  const parsed = z.object({
    type: z.enum(['supplement', 'cook', 'prep', 'water', 'custom']),
    label: z.string().min(1),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
    linked_id: z.number().int().nullable().optional(),
    enabled: z.boolean().default(true),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const db = getDb(c.env.DB)
  const [row] = await db.insert(reminders).values({
    user_id: userId,
    ...d,
    linked_id: d.linked_id ?? null,
    days: JSON.stringify(d.days),
  }).returning()
  return c.json({ ...row, days: JSON.parse(row.days) as number[] }, 201)
})

// PATCH /api/reminders/:id
app.patch('/reminders/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const body = await c.req.json()
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.time !== undefined) updates.time = body.time
  if (body.days !== undefined) updates.days = JSON.stringify(body.days)
  if (body.label !== undefined) updates.label = body.label
  const [row] = await db.update(reminders).set(updates)
    .where(and(eq(reminders.id, id), eq(reminders.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...row, days: JSON.parse(row.days) as number[] })
})

// DELETE /api/reminders/:id
app.delete('/reminders/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.user_id, userId)))
  return c.json({ ok: true })
})

// POST /api/push/action — tapped an action button inside a notification.
// The service worker posts here instead of calling the domain endpoint itself:
// one code path, and the tenant check happens where it always does.
app.post('/action', async (c) => {
  const userId = c.var.userId
  const parsed = z.object({
    action: z.enum(['done', 'yes', 'no', 'read']),
    kind: z.enum(['chore', 'supplement', 'habit', 'water']).optional(),
    id: z.number().int().optional(),
    nid: z.number().int().optional(),
  }).safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { action, kind, id, nid } = parsed.data
  const db = getDb(c.env.DB)
  const nowUnix = Math.floor(Date.now() / 1000)

  // Mark the matching feed entry read no matter which action ran — tapping a
  // button is an answer, so the bell should not keep nagging about it.
  const markRead = async () => {
    if (nid == null) return
    await db.update(notifications).set({ read_at: nowUnix })
      .where(and(eq(notifications.id, nid), eq(notifications.user_id, userId), isNull(notifications.read_at)))
      .catch(() => {})
  }

  if (action === 'read' || !kind || id == null) {
    await markRead()
    return c.json({ ok: true, done: 'read' })
  }

  // Supplements and water are keyed by UTC date everywhere else in the app
  // (client `todayDate()`, /api/supplements/:id/log), habits by the user's
  // local date. Follow each one so an action never lands on a different day
  // than the same tap made inside the app.
  const utcKey = new Date().toISOString().slice(0, 10)

  if (kind === 'chore') {
    const [row] = await db.update(chores)
      .set({ last_done_at: nowUnix, last_notified_at: null })
      .where(and(eq(chores.id, id), eq(chores.user_id, userId)))
      .returning({ id: chores.id })
    if (!row) return c.json({ error: 'Not found' }, 404)
    await markRead()
    return c.json({ ok: true, done: 'chore' })
  }

  if (kind === 'supplement') {
    const [sup] = await db.select({ id: supplements.id }).from(supplements)
      .where(and(eq(supplements.id, id), eq(supplements.user_id, userId)))
    if (!sup) return c.json({ error: 'Not found' }, 404)
    await db.insert(supplement_log).values({ supplement_id: id, date: utcKey })
    await markRead()
    return c.json({ ok: true, done: 'supplement' })
  }

  if (kind === 'habit') {
    const [h] = await db.select({ id: habits.id }).from(habits)
      .where(and(eq(habits.id, id), eq(habits.user_id, userId)))
    if (!h) return c.json({ error: 'Not found' }, 404)
    const success = action !== 'no'
    const habitKey = localDateKey(await appTimezone(db, userId))
    await db.insert(habit_checkins).values({ habit_id: id, date: habitKey, success })
      .onConflictDoUpdate({ target: [habit_checkins.habit_id, habit_checkins.date], set: { success } })
    await markRead()
    return c.json({ ok: true, done: 'habit' })
  }

  // Water: the notification carries no row id of its own — one tap = one glass.
  const [existing] = await db.select().from(water_log)
    .where(and(eq(water_log.user_id, userId), eq(water_log.date, utcKey)))
  const glasses = (existing?.glasses ?? 0) + 1
  await db.insert(water_log)
    .values({ user_id: userId, date: utcKey, glasses, target_glasses: existing?.target_glasses ?? 8 })
    .onConflictDoUpdate({ target: [water_log.user_id, water_log.date], set: { glasses } })
  await markRead()
  return c.json({ ok: true, done: 'water', glasses })
})

// ── VAPID web push: RFC 8291 (aes128gcm) + RFC 8292 (VAPID JWT, ES256) ────────

export async function sendPushNotification(
  env: Env,
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID not configured')

  const audience = new URL(endpoint).origin
  const jwt = await buildVapidJwt(audience, env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  const encrypted = await encryptPayload(JSON.stringify(payload), p256dh, auth)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: encrypted,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new PushError(`Push ${res.status} ${text}`.trim(), res.status)
  }
}

// Deliver a notification to a user: record it in the notifications feed (so it
// shows under the bell) and push it to every subscription. Delivery is
// best-effort; a failed push never blocks the recorded notification.
export async function notify(
  env: Env,
  userId: string,
  subs: PushSub[],
  payload: PushPayload,
) {
  let nid: number | undefined
  try {
    const [row] = await getDb(env.DB).insert(notifications).values({
      user_id: userId,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? null,
      read_at: null,
    }).returning({ id: notifications.id })
    nid = row?.id
  } catch { /* feed insert is non-critical */ }
  await deliver(env, userId, subs, nid ? { ...payload, nid } : payload)
}

/**
 * Push to every subscription and drop the ones the push service says are gone.
 * A 404/410 means the browser threw the subscription away (rotated it, cleared
 * site data, reinstalled the PWA) — keeping the row would make every later
 * batch fail silently, which is exactly how push "turns itself off".
 */
export async function deliver(
  env: Env,
  userId: string,
  subs: PushSub[],
  payload: PushPayload,
): Promise<{ sent: number; dropped: number; errors: string[] }> {
  const results = await Promise.allSettled(
    subs.map((s) => sendPushNotification(env, s.endpoint, s.p256dh, s.auth, payload)),
  )
  const dead: string[] = []
  const errors: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') return
    const err = r.reason
    errors.push(String(err))
    if (err instanceof PushError && (err.status === 404 || err.status === 410)) dead.push(subs[i].endpoint)
  })
  if (dead.length > 0) {
    const db = getDb(env.DB)
    for (const endpoint of dead) {
      await db.delete(push_subscriptions)
        .where(and(eq(push_subscriptions.user_id, userId), eq(push_subscriptions.endpoint, endpoint)))
        .catch(() => {})
    }
  }
  return { sent: results.filter((r) => r.status === 'fulfilled').length, dropped: dead.length, errors }
}

async function buildVapidJwt(audience: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }
  const enc = (obj: unknown) => bufferToBase64Url(new TextEncoder().encode(JSON.stringify(obj)).buffer as ArrayBuffer)
  const unsigned = `${enc(header)}.${enc(claims)}`

  const pub = base64UrlToBuffer(publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    d: privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    x: bufferToBase64Url(pub.slice(1, 33).buffer as ArrayBuffer),
    y: bufferToBase64Url(pub.slice(33, 65).buffer as ArrayBuffer),
    ext: true,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = crypto.subtle as any
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) as CryptoKey
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${bufferToBase64Url(sig)}`
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.byteLength, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.byteLength }
  return out
}

async function encryptPayload(plaintext: string, p256dhBase64: string, authBase64: string): Promise<ArrayBuffer> {
  const te = (s: string) => new TextEncoder().encode(s)
  const uaPublic = base64UrlToBuffer(p256dhBase64)
  const authSecret = base64UrlToBuffer(authBase64)

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey) as ArrayBuffer)

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
    ephemeral.privateKey, 256,
  ))

  const ikm = await hkdf(ecdhSecret, authSecret, concatBytes(te('WebPush: info\0'), uaPublic, asPublic), 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, te('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, te('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concatBytes(te(plaintext), new Uint8Array([0x02]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record,
  ))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.byteLength)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = asPublic.byteLength
  header.set(asPublic, 21)

  return concatBytes(header, ciphertext).buffer as ArrayBuffer
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial, length * 8,
  )
  return new Uint8Array(bits)
}

function base64UrlToBuffer(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = norm.padEnd(norm.length + ((4 - norm.length % 4) % 4), '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export { app as pushRouter }
