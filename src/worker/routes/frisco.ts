import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, shopping_lists, shopping_items } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

const FRISCO = 'https://www.frisco.pl'
const TOKEN_URL = `${FRISCO}/app/commerce/connect/token`
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

type FriscoProduct = {
  isAvailable?: boolean
  isStocked?: boolean
  stock?: number | null
  name?: { pl?: string }
}
type FriscoCartItem = { productId: string; quantity?: number; product?: FriscoProduct }
type Session = { token: string; uid: string; warehouse: string; visitorId: string }

const isAvailable = (p?: FriscoProduct): boolean =>
  !!p && !!p.isAvailable && !!p.isStocked && (p.stock == null || p.stock > 0)

// Normalize a shopping-list line into a search query: drop parentheticals and
// everything after "lub / albo / oraz / slash", collapse whitespace.
function toQuery(raw: string): string {
  let s = raw.split('(')[0]
  const low = s.toLowerCase()
  for (const sep of [' lub ', ' albo ', ' oraz ', '/']) {
    const i = low.indexOf(sep)
    if (i >= 0) { s = s.slice(0, i); break }
  }
  return s.split(' ').filter(Boolean).join(' ').trim()
}

// Read the `sub` (user id) claim from a JWT without verifying it.
function jwtSub(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(payload)
    return (JSON.parse(json) as { sub?: string }).sub ?? null
  } catch {
    return null
  }
}

async function tokenGrant(body: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: FRISCO,
      referer: `${FRISCO}/`,
      'user-agent': UA,
    },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Frisco token grant failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  return res.json()
}

// Resolve a Frisco access token. Prefer the refresh token; fall back to the
// password grant only when username+password secrets are set. The literal
// password is only ever a Worker secret read at runtime.
async function resolveSession(env: Env): Promise<Session> {
  const warehouse = env.FRISCO_WAREHOUSE || 'GDA'
  const visitorId = env.FRISCO_SID || ''

  if (env.FRISCO_REFRESH_TOKEN) {
    const t = await tokenGrant({ grant_type: 'refresh_token', refresh_token: env.FRISCO_REFRESH_TOKEN })
    const token = t.access_token
    if (!token) throw new Error('Refresh grant returned no access_token.')
    const uid = jwtSub(token) || env.FRISCO_USER_ID || ''
    if (!uid) throw new Error('Could not determine user id from token; set FRISCO_USER_ID.')
    return { token, uid, warehouse, visitorId }
  }

  if (env.FRISCO_USERNAME && env.FRISCO_PASSWORD) {
    const t = await tokenGrant({
      grant_type: 'password',
      username: env.FRISCO_USERNAME,
      password: env.FRISCO_PASSWORD,
    })
    const token = t.access_token
    if (!token) throw new Error('Password grant returned no access_token.')
    const uid = jwtSub(token) || env.FRISCO_USER_ID || ''
    if (!uid) throw new Error('Could not determine user id from token; set FRISCO_USER_ID.')
    return { token, uid, warehouse, visitorId }
  }

  throw new Error('Frisco auth not configured: set FRISCO_REFRESH_TOKEN (recommended) or FRISCO_USERNAME + FRISCO_PASSWORD as Worker secrets.')
}

function cartApi(session: Session) {
  const { token, uid, warehouse, visitorId } = session
  const common: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'x-frisco-warehouse': warehouse,
    'x-frisco-visitorid': visitorId,
    'x-frisco-features': 'MarginBoosting=1',
    origin: FRISCO,
    referer: `${FRISCO}/`,
    'user-agent': UA,
  }
  const jsonHeaders = { ...common, 'content-type': 'application/json' }
  const cartUrl = `${FRISCO}/app/commerce/api/v1/users/${uid}/cart`

  return {
    common,
    clear: () => fetch(`${cartUrl}/products`, { method: 'DELETE', headers: common }),
    put: (products: { productId: string; quantity: number }[]) =>
      fetch(cartUrl, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ products }) }),
    get: () => fetch(cartUrl, { headers: common }),
    search: (q: string) =>
      fetch(
        `${FRISCO}/app/commerce/api/v1/offer/products/query?purpose=Listing&pageIndex=1` +
          `&search=${encodeURIComponent(q)}&includeFacets=false&deliveryMethod=Van&pageSize=24&language=pl&disableAutocorrect=false`,
        { headers: common },
      ),
  }
}

// Unique search queries for a list's unchecked items, in stable order, so the
// same slice is produced deterministically across chunked calls.
function listQueries(rows: { name: string; checked?: unknown }[]): { q: string; raw: string }[] {
  const seen = new Set<string>()
  const out: { q: string; raw: string }[] = []
  for (const r of rows) {
    if (r.checked) continue
    const q = toQuery(r.name)
    if (!q || seen.has(q)) continue
    seen.add(q)
    out.push({ q, raw: r.name })
  }
  return out
}

// Cap the number of Frisco searches per invocation so we stay under the Workers
// subrequest limit (50 on the Free plan). PUT is an upsert, so chunks add up.
const CHUNK = 35

// POST /api/frisco/order  { listId, offset? }
// Adds one chunk of the list to the Frisco cart. The client calls this
// repeatedly (following `nextOffset`) until `done`, so a large list stays under
// the per-invocation subrequest cap. On the first chunk (offset 0) the cart is
// cleared; on the last chunk we re-read the cart and drop slot-unavailable items.
app.post('/order', async (c) => {
  let listId: number
  let offset: number
  try {
    const body = (await c.req.json()) as { listId?: number | string; offset?: number | string }
    listId = Number(body.listId)
    offset = Number(body.offset ?? 0)
  } catch {
    return c.json({ error: 'invalid_body' }, 400)
  }
  if (!Number.isFinite(listId)) return c.json({ error: 'invalid_listId' }, 400)
  if (!Number.isFinite(offset) || offset < 0) offset = 0

  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists).where(eq(shopping_lists.id, listId))
  if (!list) return c.json({ error: 'list_not_found' }, 404)
  const rows = await db.select().from(shopping_items).where(eq(shopping_items.list_id, listId))
  const queries = listQueries(rows)
  if (queries.length === 0) return c.json({ error: 'list_empty' }, 400)

  let session: Session
  try {
    session = await resolveSession(c.env)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  // First chunk clears the cart (PUT is a per-product upsert, not a replace).
  if (offset === 0) {
    const del = await api.clear()
    if (!del.ok && del.status !== 204) return c.json({ error: 'frisco_clear_failed', status: del.status }, 502)
  }

  // Search this slice, pick available matches, upsert them into the cart.
  const slice = queries.slice(offset, offset + CHUNK)
  const added: { item: string; product?: string }[] = []
  const notFound: string[] = []
  const seen = new Set<string>()
  const products: { productId: string; quantity: number }[] = []
  for (const { q, raw } of slice) {
    try {
      const sr = (await (await api.search(q)).json()) as { products?: { productId: string; product?: FriscoProduct }[] }
      const pick = (sr.products || []).find((p) => isAvailable(p.product))
      if (pick) {
        added.push({ item: raw, product: pick.product?.name?.pl })
        if (!seen.has(pick.productId)) { seen.add(pick.productId); products.push({ productId: pick.productId, quantity: 1 }) }
      } else notFound.push(raw)
    } catch {
      notFound.push(`${raw} (błąd wyszukiwania)`)
    }
  }
  if (products.length) {
    const putRes = await api.put(products)
    if (!putRes.ok) return c.json({ error: 'frisco_put_failed', status: putRes.status }, 502)
  }

  const nextOffset = offset + CHUNK
  const done = nextOffset >= queries.length

  // Last chunk: cart re-validates against the delivery slot — drop what it flags.
  let inCart: number | undefined
  const removedUnavailable: string[] = []
  if (done) {
    const cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
    const keep: { productId: string; quantity: number }[] = []
    for (const it of cart.products || []) {
      if (isAvailable(it.product)) keep.push({ productId: it.productId, quantity: it.quantity || 1 })
      else removedUnavailable.push(it.product?.name?.pl || it.productId)
    }
    if (removedUnavailable.length) { await api.clear(); await api.put(keep) }
    inCart = keep.length
  }

  return c.json({
    listId,
    listName: list.name,
    total: queries.length,
    processed: slice.length,
    nextOffset: done ? null : nextOffset,
    done,
    added,
    notFound,
    removedUnavailable,
    inCart,
  })
})

export const friscoRouter = app
