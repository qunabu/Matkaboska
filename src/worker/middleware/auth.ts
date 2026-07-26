import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

// Module-level JWKS cache — persists for the lifetime of the isolate
let jwksCache: { keys: CryptoKey[]; expiresAt: number } | null = null

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + ((4 - (str.length % 4)) % 4),
    '='
  )
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function fetchKeys(teamDomain: string): Promise<CryptoKey[]> {
  const now = Date.now()
  if (jwksCache && now < jwksCache.expiresAt) return jwksCache.keys

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)

  const { keys: rawKeys } = await res.json<{ keys: JsonWebKey[] }>()
  const keys = await Promise.all(
    rawKeys.map((k) =>
      crypto.subtle.importKey(
        'jwk',
        k,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
    )
  )
  // Cache for 10 minutes
  jwksCache = { keys, expiresAt: now + 10 * 60 * 1000 }
  return keys
}

async function verifyJwt(token: string, aud: string, teamDomain: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [headerB64, payloadB64, sigB64] = parts

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadB64))
    ) as { exp?: number; aud?: string | string[] }

    // Check expiry
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false

    // Check audience
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!audList.includes(aud)) return false

    // Verify signature
    const keys = await fetchKeys(teamDomain)
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sig = decodeBase64Url(sigB64)

    for (const key of keys) {
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
      if (ok) return true
    }
    return false
  } catch {
    return false
  }
}

export const accessAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // Skip validation when Access is not configured (local dev)
  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) {
    return next()
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const valid = await verifyJwt(token, c.env.ACCESS_AUD, c.env.ACCESS_TEAM_DOMAIN)
  if (!valid) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return next()
})
