import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { accessAuth } from './middleware/auth'

const api = new Hono<{ Bindings: Env }>()

api.use('*', cors())
api.use('*', accessAuth)

api.get('/api/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() })
)

api.get('/api/version', (c) =>
  c.json({
    version: c.env.APP_VERSION || 'dev',
    builtAt: null,
    minSupported: null,
  })
)

type AssetsBinding = { fetch: (r: Request) => Promise<Response> }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }

    const assets = env.ASSETS as unknown as AssetsBinding
    const res = await assets.fetch(request)

    // SPA fallback: serve index.html for any 404 that isn't an API or static asset
    if (res.status === 404) {
      const indexUrl = new URL('/index.html', url.origin)
      return assets.fetch(new Request(indexUrl.toString(), { headers: request.headers }))
    }

    return res
  },

  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Phase 7: evaluate reminders, send push notifications
  },
} satisfies ExportedHandler<Env>
