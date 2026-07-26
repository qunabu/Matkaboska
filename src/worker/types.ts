import type { D1Database, KVNamespace, Fetcher } from '@cloudflare/workers-types'

export type Env = {
  DB: D1Database
  KV: KVNamespace
  ASSETS: Fetcher
  APP_VERSION: string
  ANTHROPIC_API_KEY: string
  ANTHROPIC_MODEL: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  ACCESS_AUD: string
  ACCESS_TEAM_DOMAIN: string
}
