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

// POST /api/frisco/order  { listId }
// Sets the Frisco cart to exactly the (unchecked) items of the given shopping
// list and returns what could not be added / was dropped as unavailable.
app.post('/order', async (c) => {
  let listId: number
  try {
    const body = (await c.req.json()) as { listId?: number | string }
    listId = Number(body.listId)
  } catch {
    return c.json({ error: 'invalid_body' }, 400)
  }
  if (!Number.isFinite(listId)) return c.json({ error: 'invalid_listId' }, 400)

  const db = getDb(c.env.DB)
  const [list] = await db.select().from(shopping_lists).where(eq(shopping_lists.id, listId))
  if (!list) return c.json({ error: 'list_not_found' }, 404)
  const rows = await db.select().from(shopping_items).where(eq(shopping_items.list_id, listId))
  const names = rows.filter((r) => !r.checked).map((r) => r.name)
  if (names.length === 0) return c.json({ error: 'list_empty' }, 400)

  let session: Session
  try {
    session = await resolveSession(c.env)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  // 1) clear (PUT is a per-product upsert, not a whole-cart replace)
  const del = await api.clear()
  if (!del.ok && del.status !== 204) {
    return c.json({ error: 'frisco_clear_failed', status: del.status }, 502)
  }

  // 2) search each item, pick an available match
  const added: { raw: string; id: string; name?: string }[] = []
  const notFound: string[] = []
  for (const raw of names) {
    const q = toQuery(raw)
    try {
      const sr = (await (await api.search(q)).json()) as { products?: { productId: string; product?: FriscoProduct }[] }
      const pick = (sr.products || []).find((p) => isAvailable(p.product))
      if (pick) added.push({ raw, id: pick.productId, name: pick.product?.name?.pl })
      else notFound.push(raw)
    } catch {
      notFound.push(`${raw} (błąd wyszukiwania)`)
    }
  }
  const seen = new Set<string>()
  const products: { productId: string; quantity: number }[] = []
  for (const a of added) {
    if (!seen.has(a.id)) { seen.add(a.id); products.push({ productId: a.id, quantity: 1 }) }
  }

  // 3) set cart = list
  const putRes = await api.put(products)
  if (!putRes.ok) return c.json({ error: 'frisco_put_failed', status: putRes.status }, 502)

  // 4) cart re-validates against the delivery slot — drop what it marks unavailable
  const cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
  const keep: { productId: string; quantity: number }[] = []
  const removedUnavailable: string[] = []
  for (const it of cart.products || []) {
    if (isAvailable(it.product)) keep.push({ productId: it.productId, quantity: it.quantity || 1 })
    else removedUnavailable.push(it.product?.name?.pl || it.productId)
  }
  if (removedUnavailable.length) { await api.clear(); await api.put(keep) }

  return c.json({
    listId,
    listName: list.name,
    requested: names.length,
    inCart: keep.length,
    added: added.map((a) => ({ item: a.raw, product: a.name })),
    notFound,
    removedUnavailable,
  })
})

export const friscoRouter = app
