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
  // Google OAuth (self-hosted, like the garaz app — no Cloudflare Access).
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_HD?: string                    // Workspace domain hint for the account picker
  ALLOWED_GOOGLE_DOMAINS?: string       // comma list; empty = any domain allowed
  ALLOWED_GOOGLE_EMAILS?: string        // comma list of exact emails; empty = not restricted
  // Used in local dev when Google OAuth is not configured
  DEV_USER_EMAIL?: string
  // Account whose recipes new/empty users may import as a starter set.
  STARTER_RECIPES_USER?: string
  // Frisco integration (all optional; set as Worker secrets, never committed).
  FRISCO_REFRESH_TOKEN?: string
  FRISCO_USERNAME?: string
  FRISCO_PASSWORD?: string
  FRISCO_WAREHOUSE?: string
  FRISCO_USER_ID?: string
  FRISCO_SID?: string
}

export type AppVariables = {
  userId: string
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}
