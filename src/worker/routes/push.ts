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
      title: 'Planer posiłków',
      body: 'Powiadomienia działają! 🎉',
    }))
  )
  const sent = results.filter(r => r.status === 'fulfilled').length
  return c.json({ sent, total: subs.length })
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

// ── VAPID web push implementation using Web Crypto API ────────────────────────

export async function sendPushNotification(
  env: Env,
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; url?: string },
) {
  const vapidPublicKey = env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY
  const vapidSubject = env.VAPID_SUBJECT || 'mailto:admin@example.com'

  if (!vapidPublicKey || !vapidPrivateKey) throw new Error('VAPID not configured')

  const audience = new URL(endpoint).origin
  const exp = Math.floor(Date.now() / 1000) + 43200 // 12h

  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = { sub: vapidSubject, aud: audience, exp }

  const b64 = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const enc = (s: string) => b64(String.fromCharCode(...new TextEncoder().encode(s)))

  const unsigned = `${enc(JSON.stringify(header))}.${enc(JSON.stringify(claims))}`

  // Import VAPID private key (P-256 JWK or raw base64url)
  const rawKey = base64UrlToBuffer(vapidPrivateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', rawKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  ).catch(async () => {
    // Try raw format (32 bytes)
    return crypto.subtle.importKey(
      'raw', rawKey.slice(-32),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign'],
    )
  })

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${bufferToBase64Url(sigBuf)}`

  const vapidAuthHeader = `vapid t=${jwt},k=${vapidPublicKey}`

  // Encrypt payload using aes128gcm
  const body = JSON.stringify(payload)
  const encrypted = await encryptPayload(body, p256dh, auth)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthHeader,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body: encrypted,
  })

  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed: ${res.status}`)
  }
}

async function encryptPayload(plaintext: string, p256dhBase64: string, authBase64: string): Promise<ArrayBuffer> {
  const authSecret = base64UrlToBuffer(authBase64)
  const recipientPublicKey = base64UrlToBuffer(p256dhBase64)

  // Generate ephemeral key pair
  const ephemeralPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveKey', 'deriveBits'],
  ) as CryptoKeyPair
  const ephemeralPublicKeyBuffer = await crypto.subtle.exportKey('raw', ephemeralPair.publicKey) as ArrayBuffer

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    'raw', recipientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  )

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', $public: recipientKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
    ephemeralPair.privateKey, 256,
  )

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // PRK using HKDF
  const prk = await hkdf(
    new Uint8Array(sharedSecret),
    authSecret,
    buildInfo('auth', new Uint8Array(0), new Uint8Array(0)),
    32,
  )

  // CEK (content encryption key)
  const cek = await hkdf(
    prk,
    salt,
    buildInfo('aesgcm128', new Uint8Array(recipientPublicKey), new Uint8Array(ephemeralPublicKeyBuffer)),
    16,
  )

  // NONCE
  const nonce = await hkdf(prk, salt, buildInfo('nonce', new Uint8Array(recipientPublicKey), new Uint8Array(ephemeralPublicKeyBuffer)), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const plaintextBuf = new TextEncoder().encode(plaintext)

  // aes128gcm record: salt(16) + rs(4) + idlen(1) + ephemeral_public_key + ciphertext
  const rs = 4096
  const idlen = ephemeralPublicKeyBuffer.byteLength
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new Uint8Array(0), tagLength: 128 },
    aesKey,
    new Uint8Array([...new Uint8Array(plaintextBuf), 2]), // 2 = padding delimiter
  )

  const header = new Uint8Array(21 + idlen)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs, false)
  header[20] = idlen
  header.set(new Uint8Array(ephemeralPublicKeyBuffer), 21)

  const result = new Uint8Array(header.byteLength + ciphertext.byteLength)
  result.set(header)
  result.set(new Uint8Array(ciphertext), header.byteLength)
  return result.buffer
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial, length * 8,
  )
  return new Uint8Array(bits)
}

function buildInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(`Content-Encoding: ${type}\0`)
  const buf = new Uint8Array(typeBytes.byteLength + 1 + 2 + clientPublicKey.byteLength + 2 + serverPublicKey.byteLength)
  let offset = 0
  buf.set(typeBytes, offset); offset += typeBytes.byteLength
  buf[offset++] = 0 // context label
  new DataView(buf.buffer).setUint16(offset, clientPublicKey.byteLength, false); offset += 2
  buf.set(clientPublicKey, offset); offset += clientPublicKey.byteLength
  new DataView(buf.buffer).setUint16(offset, serverPublicKey.byteLength, false); offset += 2
  buf.set(serverPublicKey, offset)
  return buf
}

function base64UrlToBuffer(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(b64.length + ((4 - b64.length % 4) % 4), '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export { app as pushRouter }
