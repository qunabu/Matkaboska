import type { D1Database, KVNamespace, Fetcher, Ai } from '@cloudflare/workers-types'

export type Env = {
  DB: D1Database
  KV: KVNamespace
  ASSETS: Fetcher
  AI?: Ai
  ELEVENLABS_API_KEY?: string
  APP_VERSION: string
  ANTHROPIC_API_KEY: string
  ANTHROPIC_MODEL: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  ACCESS_AUD: string
  ACCESS_TEAM_DOMAIN: string
  // Frisco integration (all optional; set as Worker secrets, never committed).
  // Prefer FRISCO_REFRESH_TOKEN; the username/password pair uses the OAuth
  // password grant only if no refresh token is configured.
  FRISCO_REFRESH_TOKEN?: string
  FRISCO_USERNAME?: string
  FRISCO_PASSWORD?: string
  FRISCO_WAREHOUSE?: string
  FRISCO_USER_ID?: string
  FRISCO_SID?: string
}
