import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, shopping_lists, shopping_items, products as productsTable } from '../db/index'
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

// Cap the number of Frisco searches per invocation so we stay under the Workers
// subrequest limit (50 on the Free plan). PUT is an upsert, so chunks add up.
const CHUNK = 35

// Remove one product from the Frisco cart (best-effort). Returns true if the
// product is no longer in the cart afterwards. Used by the shopping list's
// "mam w domu" action. Throws only on auth failure.
export async function removeProductFromCart(env: Env, productId: string): Promise<boolean> {
  const session = await resolveSession(env)
  const api = cartApi(session)
  await api.put([{ productId, quantity: 0 }])
  let cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
  if ((cart.products || []).some((p) => p.productId === productId)) {
    const keep = (cart.products || [])
      .filter((p) => p.productId !== productId)
      .map((p) => ({ productId: p.productId, quantity: p.quantity || 1 }))
    await api.clear()
    await api.put(keep)
    cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
  }
  return !(cart.products || []).some((p) => p.productId === productId)
}

// POST /api/frisco/order  { listId, offset? }
// Adds one chunk of the list's (unchecked) items to the Frisco cart, marking
// each row's `in_frisco` / `frisco_product_id` so the shopping list can show
// what actually made it into the cart. The client calls this repeatedly
// (following `nextOffset`) until `done`, so a large list stays under the
// per-invocation subrequest cap. On the first chunk (offset 0) the cart and all
// Frisco flags are reset; on the last chunk we re-read the cart, drop
// slot-unavailable items, and clear their rows' flags.
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
  const allRows = await db.select().from(shopping_items).where(eq(shopping_items.list_id, listId))
  // Only order items not already marked as bought; stable order for chunking.
  const rows = allRows.filter((r) => !r.checked).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  if (rows.length === 0) return c.json({ error: 'list_empty' }, 400)

  let session: Session
  try {
    session = await resolveSession(c.env)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  // First chunk clears the cart (PUT is a per-product upsert, not a replace) and
  // resets the Frisco flags on every unchecked row of this list.
  if (offset === 0) {
    const del = await api.clear()
    if (!del.ok && del.status !== 204) return c.json({ error: 'frisco_clear_failed', status: del.status }, 502)
    await db.update(shopping_items).set({ in_frisco: false, frisco_product_id: null }).where(eq(shopping_items.list_id, listId))
  }

  // Known Frisco pids from the product repository — resolve by exact name so we
  // don't search the API for products we already know.
  const repoRows = await db.select().from(productsTable)
  const repoPid = new Map<string, string>()
  for (const p of repoRows) { if (p.frisco_product_id) repoPid.set(p.name.trim().toLowerCase(), p.frisco_product_id) }

  // Search this slice, pick available matches, upsert them, and flag each row.
  const slice = rows.slice(offset, offset + CHUNK)
  const added: { item: string; product?: string }[] = []
  const notFound: string[] = []
  const seen = new Set<string>()
  const products: { productId: string; quantity: number }[] = []
  const queryCache = new Map<string, { productId: string; name?: string } | null>()

  for (const row of slice) {
    const q = toQuery(row.name)
    let pick: { productId: string; name?: string } | null = null
    const repoHit = repoPid.get(row.name.trim().toLowerCase())
    if (repoHit) {
      pick = { productId: repoHit, name: row.name }
    } else if (q) {
      if (queryCache.has(q)) {
        pick = queryCache.get(q) ?? null
      } else {
        try {
          const sr = (await (await api.search(q)).json()) as { products?: { productId: string; product?: FriscoProduct }[] }
          const found = (sr.products || []).find((p) => isAvailable(p.product))
          pick = found ? { productId: found.productId, name: found.product?.name?.pl } : null
        } catch {
          pick = null
        }
        queryCache.set(q, pick)
      }
    }
    if (pick) {
      added.push({ item: row.name, product: pick.name })
      if (!seen.has(pick.productId)) { seen.add(pick.productId); products.push({ productId: pick.productId, quantity: 1 }) }
      await db.update(shopping_items).set({ in_frisco: true, frisco_product_id: pick.productId }).where(eq(shopping_items.id, row.id))
    } else {
      notFound.push(row.name)
      await db.update(shopping_items).set({ in_frisco: false, frisco_product_id: null }).where(eq(shopping_items.id, row.id))
    }
  }
  if (products.length) {
    const putRes = await api.put(products)
    if (!putRes.ok) return c.json({ error: 'frisco_put_failed', status: putRes.status }, 502)
  }

  const nextOffset = offset + CHUNK
  const done = nextOffset >= rows.length

  // Last chunk: cart re-validates against the delivery slot — drop what it flags
  // and clear the Frisco flag on the affected rows.
  let inCart: number | undefined
  const removedUnavailable: string[] = []
  if (done) {
    const cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
    const keep: { productId: string; quantity: number }[] = []
    const removedIds: string[] = []
    for (const it of cart.products || []) {
      if (isAvailable(it.product)) keep.push({ productId: it.productId, quantity: it.quantity || 1 })
      else { removedUnavailable.push(it.product?.name?.pl || it.productId); removedIds.push(it.productId) }
    }
    if (removedIds.length) {
      await api.clear(); await api.put(keep)
      for (const pid of removedIds) {
        await db.update(shopping_items).set({ in_frisco: false })
          .where(and(eq(shopping_items.list_id, listId), eq(shopping_items.frisco_product_id, pid)))
      }
    }
    inCart = keep.length
  }

  return c.json({
    listId,
    listName: list.name,
    total: rows.length,
    processed: slice.length,
    nextOffset: done ? null : nextOffset,
    done,
    added,
    notFound,
    removedUnavailable,
    inCart,
  })
})

// POST /api/frisco/item  { itemId, inCart }
// Toggle a single shopping-list item in the Frisco cart: inCart=false removes
// the matched product from the cart, inCart=true adds it back (searching by
// name if we don't have a productId yet). Keeps the row's in_frisco flag in sync.
app.post('/item', async (c) => {
  let itemId: number
  let inCart: boolean
  try {
    const body = (await c.req.json()) as { itemId?: number | string; inCart?: boolean }
    itemId = Number(body.itemId)
    inCart = !!body.inCart
  } catch {
    return c.json({ error: 'invalid_body' }, 400)
  }
  if (!Number.isFinite(itemId)) return c.json({ error: 'invalid_itemId' }, 400)

  const db = getDb(c.env.DB)
  const [item] = await db.select().from(shopping_items).where(eq(shopping_items.id, itemId))
  if (!item) return c.json({ error: 'item_not_found' }, 404)

  let session: Session
  try {
    session = await resolveSession(c.env)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  if (!inCart) {
    // Remove from cart.
    const pid = item.frisco_product_id
    if (!pid) {
      await db.update(shopping_items).set({ in_frisco: false }).where(eq(shopping_items.id, itemId))
      return c.json({ inCart: false, removed: false })
    }
    // Setting quantity 0 is how the Frisco UI drops a line; verify and, if it
    // lingers, fall back to a clear + re-put of everything else.
    await api.put([{ productId: pid, quantity: 0 }])
    let cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
    if ((cart.products || []).some((p) => p.productId === pid)) {
      const keep = (cart.products || [])
        .filter((p) => p.productId !== pid)
        .map((p) => ({ productId: p.productId, quantity: p.quantity || 1 }))
      await api.clear()
      await api.put(keep)
      cart = (await (await api.get()).json()) as { products?: FriscoCartItem[] }
    }
    const stillPresent = (cart.products || []).some((p) => p.productId === pid)
    await db.update(shopping_items).set({ in_frisco: false }).where(eq(shopping_items.id, itemId))
    return c.json({ inCart: false, removed: !stillPresent, productId: pid, cartCount: (cart.products || []).length })
  }

  // Add to cart.
  let pid = item.frisco_product_id
  let name: string | undefined
  if (!pid) {
    // Reuse a stored pid from the product repository (exact name match).
    const [repoProduct] = await db.select().from(productsTable).where(eq(productsTable.name, item.name))
    if (repoProduct?.frisco_product_id) pid = repoProduct.frisco_product_id
  }
  if (!pid) {
    const q = toQuery(item.name)
    if (!q) return c.json({ error: 'not_found' }, 200)
    try {
      const sr = (await (await api.search(q)).json()) as { products?: { productId: string; product?: FriscoProduct }[] }
      const pick = (sr.products || []).find((p) => isAvailable(p.product))
      if (!pick) return c.json({ inCart: false, notFound: true })
      pid = pick.productId
      name = pick.product?.name?.pl
    } catch {
      return c.json({ error: 'search_failed' }, 502)
    }
  }
  const putRes = await api.put([{ productId: pid, quantity: 1 }])
  if (!putRes.ok) return c.json({ error: 'frisco_put_failed', status: putRes.status }, 502)
  await db.update(shopping_items).set({ in_frisco: true, frisco_product_id: pid }).where(eq(shopping_items.id, itemId))
  return c.json({ inCart: true, productId: pid, product: name })
})

export const friscoRouter = app
