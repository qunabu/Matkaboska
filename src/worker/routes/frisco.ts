import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, shopping_lists, shopping_items, products as productsTable, settings } from '../db/index'
import type { AppEnv, Env } from '../types'

const app = new Hono<AppEnv>()

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
  categories?: { name?: { pl?: string } }[]
}
type FriscoSearchItem = { productId: string; product?: FriscoProduct }
type FriscoCartItem = { productId: string; quantity?: number; product?: FriscoProduct }
type Session = { token: string; uid: string; warehouse: string; visitorId: string }
type FriscoUserConfig = {
  refresh_token?: string
  username?: string
  password?: string
  warehouse?: string
  user_id?: string
  sid?: string
}

const isAvailable = (p?: FriscoProduct): boolean =>
  !!p && !!p.isAvailable && !!p.isStocked && (p.stock == null || p.stock > 0)

function isBreadName(name: string): boolean {
  const n = name.toLowerCase()
  if (/tart/.test(n)) return false
  return /(chleb|pieczyw|bagietk|ciabatt|tost|cha[łl]k|kajzerk|rogal|bu[łl]k)/.test(n)
}

const BLOCKED_CATEGORY_RE = /dania gotowe|garma[żz]|nadziewan/i
const BLOCKED_PIDS = new Set<string>(['149408', '149464'])
function isBlockedPick(item: FriscoSearchItem): boolean {
  if (BLOCKED_PIDS.has(item.productId)) return true
  return (item.product?.categories ?? []).some((c) => BLOCKED_CATEGORY_RE.test(c?.name?.pl ?? ''))
}
const pickAllowed = (item: FriscoSearchItem): boolean => isAvailable(item.product) && !isBlockedPick(item)

function toQuery(raw: string): string {
  let s = raw.split('(')[0]
  const low = s.toLowerCase()
  for (const sep of [' lub ', ' albo ', ' oraz ', '/']) {
    const i = low.indexOf(sep)
    if (i >= 0) { s = s.slice(0, i); break }
  }
  return s.split(' ').filter(Boolean).join(' ').trim()
}

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

// Load Frisco credentials for a user. These are PER-USER ONLY (settings key
// 'frisco', scoped by user_id) and never shared: there is no env fallback for the
// account-identifying fields (login/password/refresh_token/user_id/sid), so one
// user can never end up ordering on another user's Frisco account. The only env
// fallback is the warehouse/region, which is not account-identifying.
async function loadFriscoConfig(db: ReturnType<typeof getDb>, userId: string, env: Env): Promise<FriscoUserConfig> {
  let userCfg: FriscoUserConfig = {}
  try {
    const [row] = await db.select().from(settings)
      .where(and(eq(settings.user_id, userId), eq(settings.key, 'frisco')))
    if (row) userCfg = JSON.parse(row.value) as FriscoUserConfig
  } catch { /* no per-user config yet */ }
  return {
    refresh_token: userCfg.refresh_token,
    username: userCfg.username,
    password: userCfg.password,
    user_id: userCfg.user_id,
    sid: userCfg.sid,
    warehouse: userCfg.warehouse || env.FRISCO_WAREHOUSE || 'GDA',
  }
}

async function resolveSession(cfg: FriscoUserConfig): Promise<Session> {
  const warehouse = cfg.warehouse || 'GDA'
  const visitorId = cfg.sid || ''

  if (cfg.refresh_token) {
    const t = await tokenGrant({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token })
    const token = t.access_token
    if (!token) throw new Error('Refresh grant returned no access_token.')
    const uid = jwtSub(token) || cfg.user_id || ''
    if (!uid) throw new Error('Could not determine user id from token; set FRISCO_USER_ID.')
    return { token, uid, warehouse, visitorId }
  }

  if (cfg.username && cfg.password) {
    const t = await tokenGrant({
      grant_type: 'password',
      username: cfg.username,
      password: cfg.password,
    })
    const token = t.access_token
    if (!token) throw new Error('Password grant returned no access_token.')
    const uid = jwtSub(token) || cfg.user_id || ''
    if (!uid) throw new Error('Could not determine user id from token; set FRISCO_USER_ID.')
    return { token, uid, warehouse, visitorId }
  }

  throw new Error('Konto Frisco nie jest skonfigurowane — dodaj swój login i hasło Frisco w Ustawieniach → Integracje.')
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

const CHUNK = 35

// Remove one product from the Frisco cart (best-effort). Called by shopping routes.
export async function removeProductFromCart(env: Env, db: ReturnType<typeof getDb>, userId: string, productId: string): Promise<boolean> {
  const cfg = await loadFriscoConfig(db, userId, env)
  const session = await resolveSession(cfg)
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

// POST /api/frisco/order
app.post('/order', async (c) => {
  const userId = c.var.userId
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
  const [list] = await db.select().from(shopping_lists)
    .where(and(eq(shopping_lists.id, listId), eq(shopping_lists.user_id, userId)))
  if (!list) return c.json({ error: 'list_not_found' }, 404)
  const allRows = await db.select().from(shopping_items).where(eq(shopping_items.list_id, listId))
  const rows = allRows.filter((r) => !r.checked).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  if (rows.length === 0) return c.json({ error: 'list_empty' }, 400)

  let session: Session
  try {
    const cfg = await loadFriscoConfig(db, userId, c.env)
    session = await resolveSession(cfg)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  if (offset === 0) {
    const del = await api.clear()
    if (!del.ok && del.status !== 204) return c.json({ error: 'frisco_clear_failed', status: del.status }, 502)
    await db.update(shopping_items).set({ in_frisco: false, frisco_product_id: null }).where(eq(shopping_items.list_id, listId))
  }

  const repoRows = await db.select().from(productsTable).where(eq(productsTable.user_id, userId))
  const repoPid = new Map<string, string>()
  for (const p of repoRows) { if (p.frisco_product_id) repoPid.set(p.name.trim().toLowerCase(), p.frisco_product_id) }

  const slice = rows.slice(offset, offset + CHUNK)
  const added: { item: string; product?: string }[] = []
  const notFound: string[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  const products: { productId: string; quantity: number }[] = []
  const queryCache = new Map<string, { productId: string; name?: string } | null>()

  for (const row of slice) {
    if (isBreadName(row.name)) {
      skipped.push(row.name)
      await db.update(shopping_items).set({ in_frisco: false, frisco_product_id: null }).where(eq(shopping_items.id, row.id))
      continue
    }
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
          const sr = (await (await api.search(q)).json()) as { products?: FriscoSearchItem[] }
          const found = (sr.products || []).find(pickAllowed)
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
    skipped,
    removedUnavailable,
    inCart,
  })
})

// POST /api/frisco/item
app.post('/item', async (c) => {
  const userId = c.var.userId
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
  // Verify the item's list belongs to the user
  const [ownedList] = await db.select({ id: shopping_lists.id }).from(shopping_lists)
    .where(and(eq(shopping_lists.id, item.list_id), eq(shopping_lists.user_id, userId)))
  if (!ownedList) return c.json({ error: 'item_not_found' }, 404)

  let session: Session
  try {
    const cfg = await loadFriscoConfig(db, userId, c.env)
    session = await resolveSession(cfg)
  } catch (e) {
    return c.json({ error: 'frisco_auth_failed', detail: (e as Error).message }, 502)
  }
  const api = cartApi(session)

  if (!inCart) {
    const pid = item.frisco_product_id
    if (!pid) {
      await db.update(shopping_items).set({ in_frisco: false }).where(eq(shopping_items.id, itemId))
      return c.json({ inCart: false, removed: false })
    }
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

  if (isBreadName(item.name)) {
    await db.update(shopping_items).set({ in_frisco: false }).where(eq(shopping_items.id, itemId))
    return c.json({ inCart: false, blocked: true })
  }
  let pid = item.frisco_product_id
  let name: string | undefined
  if (!pid) {
    const [repoProduct] = await db.select().from(productsTable)
      .where(and(eq(productsTable.name, item.name), eq(productsTable.user_id, userId)))
    if (repoProduct?.frisco_product_id) pid = repoProduct.frisco_product_id
  }
  if (!pid) {
    const q = toQuery(item.name)
    if (!q) return c.json({ error: 'not_found' }, 200)
    try {
      const sr = (await (await api.search(q)).json()) as { products?: FriscoSearchItem[] }
      const pick = (sr.products || []).find(pickAllowed)
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
