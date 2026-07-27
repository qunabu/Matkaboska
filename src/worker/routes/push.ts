import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, push_subscriptions, reminders } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// POST /api/push/subscribe
app.post('/subscribe', async (c) => {
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
    .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? null })
    .onConflictDoUpdate({ target: push_subscriptions.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth } })

  return c.json({ ok: true })
})

// DELETE /api/push/unsubscribe
app.delete('/unsubscribe', async (c) => {
  const body = await c.req.json()
  const { endpoint } = z.object({ endpoint: z.string() }).parse(body)
  const db = getDb(c.env.DB)
  await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint))
  return c.json({ ok: true })
})

// POST /api/push/test
app.post('/test', async (c) => {
  if (!c.env.VAPID_PRIVATE_KEY) return c.json({ error: 'Push not configured' }, 503)
  const db = getDb(c.env.DB)
  const subs = await db.select().from(push_subscriptions)
  if (subs.length === 0) return c.json({ error: 'No subscriptions' }, 400)

  const results = await Promise.allSettled(
    subs.map(sub => sendPushNotification(c.env, sub.endpoint, sub.p256dh, sub.auth, {
      title: 'Matka Boska LGBT 🌈',
      body: 'Powiadomienia działają! 🙏',
      url: '/',
    }))
  )
  const sent = results.filter(r => r.status === 'fulfilled').length
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => String(r.reason))
  return c.json({ sent, total: subs.length, errors })
})

// GET /api/reminders
app.get('/reminders', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(reminders).orderBy(reminders.time)
  const items = rows.map(r => ({ ...r, days: JSON.parse(r.days) as number[] }))
  return c.json({ items, total: items.length })
})

// POST /api/reminders
app.post('/reminders', async (c) => {
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
    ...d,
    linked_id: d.linked_id ?? null,
    days: JSON.stringify(d.days),
  }).returning()
  return c.json({ ...row, days: JSON.parse(row.days) as number[] }, 201)
})

// PATCH /api/reminders/:id
app.patch('/reminders/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const db = getDb(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.time !== undefined) updates.time = body.time
  if (body.days !== undefined) updates.days = JSON.stringify(body.days)
  if (body.label !== undefined) updates.label = body.label
  const [row] = await db.update(reminders).set(updates).where(eq(reminders.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...row, days: JSON.parse(row.days) as number[] })
})

// DELETE /api/reminders/:id
app.delete('/reminders/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(reminders).where(eq(reminders.id, id))
  return c.json({ ok: true })
})

// ── VAPID web push: RFC 8291 (aes128gcm) + RFC 8292 (VAPID JWT, ES256) ────────

export async function sendPushNotification(
  env: Env,
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; url?: string },
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
    throw new Error(`Push ${res.status} ${text}`.trim())
  }
}

// VAPID auth JWT (ES256). Imports the raw web-push private key (d) as a JWK,
// deriving x/y from the public key point.
async function buildVapidJwt(audience: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }
  const enc = (obj: unknown) => bufferToBase64Url(new TextEncoder().encode(JSON.stringify(obj)).buffer as ArrayBuffer)
  const unsigned = `${enc(header)}.${enc(claims)}`

  const pub = base64UrlToBuffer(publicKey) // 0x04 || X(32) || Y(32)
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
  const uaPublic = base64UrlToBuffer(p256dhBase64) // recipient public key (65)
  const authSecret = base64UrlToBuffer(authBase64) // 16 bytes

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey) as ArrayBuffer) // 65

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
    ephemeral.privateKey, 256,
  ))

  // IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info\0" || ua || as)
  const ikm = await hkdf(ecdhSecret, authSecret, concatBytes(te('WebPush: info\0'), uaPublic, asPublic), 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, te('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, te('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concatBytes(te(plaintext), new Uint8Array([0x02])) // single record + padding delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record,
  ))

  // aes128gcm header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.byteLength)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = asPublic.byteLength
  header.set(asPublic, 21)

  return concatBytes(header, ciphertext).buffer as ArrayBuffer
}

// HKDF (extract + expand) via Web Crypto.
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
