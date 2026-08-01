import { createMiddleware } from 'hono/factory'
import type { Env, AppVariables } from '../types'

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
  jwksCache = { keys, expiresAt: now + 10 * 60 * 1000 }
  return keys
}

type JwtPayload = {
  exp?: number
  aud?: string | string[]
  email?: string
  sub?: string
  name?: string
}

async function verifyJwt(
  token: string,
  aud: string,
  teamDomain: string,
): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadB64))
    ) as JwtPayload

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null

    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!audList.includes(aud)) return null

    const keys = await fetchKeys(teamDomain)
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sig = decodeBase64Url(sigB64)

    for (const key of keys) {
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
      if (ok) return payload
    }
    return null
  } catch {
    return null
  }
}

export const accessAuth = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(
  async (c, next) => {
    // Local dev: skip CF Access validation, use DEV_USER_EMAIL
    if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) {
      c.set('userId', c.env.DEV_USER_EMAIL || 'dev@localhost')
      return next()
    }

    const token = c.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const payload = await verifyJwt(token, c.env.ACCESS_AUD, c.env.ACCESS_TEAM_DOMAIN)
    if (!payload || !payload.email) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    c.set('userId', payload.email)
    return next()
  }
)
