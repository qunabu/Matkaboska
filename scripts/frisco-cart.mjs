#!/usr/bin/env node
/*
 * Frisco cart filler — pulls a shopping list from the Matka Boska app API and
 * sets your Frisco cart to exactly that list, dropping anything Frisco reports
 * as unavailable for the chosen delivery slot.
 *
 * Usage:
 *   node scripts/frisco-cart.mjs <listId>
 *   npm run frisco -- <listId>
 *
 * Config (.env, never committed — see .env.example):
 *   MBL_BASE_URL          default https://meal-planner.qunabu.workers.dev
 *   MBL_PIN               PIN gate for the app API (required to read the list)
 *   FRISCO_REFRESH_TOKEN  (recommended) OAuth refresh token. Get it ONCE by
 *                         running the connect/token password-grant curl in your
 *                         own terminal and copying the `refresh_token` field
 *                         from the JSON response. The script exchanges it for a
 *                         fresh access token on every run — no password, no
 *                         browser.
 *   FRISCO_COOKIE         (fallback) your Frisco cookie header pasted from the
 *                         browser; the access token in it lives ~10 min.
 *   FRISCO_WAREHOUSE      default GDA
 *   FRISCO_SID            optional x-frisco-visitorid
 *
 * What it does NOT do: log in with your password (you obtain the refresh token
 * yourself), and place/pay for the order. You review the cart and check out.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

// ---- tiny .env loader (no dependency) --------------------------------------
function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (env[m[1]] === undefined) env[m[1]] = v
    }
  } catch { /* no .env — rely on process.env */ }
  return env
}

function parseCookie(header) {
  const map = {}
  for (const part of String(header).split('; ')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    map[part.slice(0, i).trim()] = part.slice(i + 1)
  }
  return map
}

// ---- app API: authenticate with the PIN, then read the shopping list -------
async function fetchListFromApp(base, pin, listId) {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!login.ok) throw new Error(`Logowanie do aplikacji nie powiodło się (${login.status}). Sprawdź MBL_PIN.`)
  const setCookies = login.headers.getSetCookie?.() ?? []
  const authCookie = setCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('mbl_auth='))
  if (!authCookie) throw new Error('Brak ciasteczka sesji z aplikacji.')

  const res = await fetch(`${base}/api/shopping-lists/${listId}`, { headers: { cookie: authCookie } })
  if (res.status === 404) throw new Error(`Lista #${listId} nie istnieje.`)
  if (!res.ok) throw new Error(`Nie udało się pobrać listy #${listId} (${res.status}).`)
  const data = await res.json()
  const names = (data.items || []).filter((i) => !i.checked).map((i) => i.name)
  return { name: data.name || `#${listId}`, names }
}

// ---- Frisco commerce API ---------------------------------------------------
const clean = (raw) => {
  let s = raw.split('(')[0]
  const low = s.toLowerCase()
  for (const sep of [' lub ', ' albo ', ' oraz ', '/']) {
    const i = low.indexOf(sep)
    if (i >= 0) { s = s.slice(0, i); break }
  }
  return s.split(' ').filter(Boolean).join(' ').trim()
}
const available = (p) => p && p.isAvailable && p.isStocked && (p.stock == null || p.stock > 0)

const FRISCO = 'https://www.frisco.pl'
const TOKEN_URL = `${FRISCO}/app/commerce/connect/token`

// Decode the `sub` (user id) claim from a JWT access token — no verification,
// just reading the payload.
function jwtSub(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).sub
  } catch {
    return null
  }
}

// Exchange a refresh token for a fresh access token (OAuth refresh grant — no
// password involved). Frisco issues refresh tokens with offline_access scope.
async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: FRISCO,
      referer: `${FRISCO}/`,
      'user-agent': UA,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Odświeżenie tokenu nie powiodło się (${res.status}). Refresh token mógł wygasnąć — pobierz nowy. ${detail.slice(0, 200)}`)
  }
  const j = await res.json()
  if (!j.access_token) throw new Error('Endpoint tokenu nie zwrócił access_token.')
  return j
}

// Resolve a Frisco session from .env: prefer FRISCO_REFRESH_TOKEN (password-free,
// re-usable), fall back to a pasted FRISCO_COOKIE.
async function resolveFriscoSession(env) {
  const warehouse = env.FRISCO_WAREHOUSE || 'GDA'
  if (env.FRISCO_REFRESH_TOKEN) {
    const t = await refreshAccessToken(env.FRISCO_REFRESH_TOKEN)
    const token = t.access_token
    const uid = jwtSub(token) || env.FRISCO_USER_ID
    if (!uid) throw new Error('Nie udało się odczytać user id z tokenu — ustaw FRISCO_USER_ID w .env.')
    if (t.refresh_token && t.refresh_token !== env.FRISCO_REFRESH_TOKEN) {
      console.log('  (Frisco zwróciło nowy refresh_token — zaktualizuj FRISCO_REFRESH_TOKEN w .env, jeśli stary przestanie działać.)')
    }
    return { token, uid, warehouse, visitorId: env.FRISCO_SID || '' }
  }
  if (env.FRISCO_COOKIE) {
    const c = parseCookie(env.FRISCO_COOKIE)
    const token = decodeURIComponent(c.sessionIdN || '')
    const uid = c.userIdN || jwtSub(token) || env.FRISCO_USER_ID
    if (!token || !uid) throw new Error('FRISCO_COOKIE nie zawiera sessionIdN / userIdN — wklej pełne ciasteczko z przeglądarki.')
    return { token, uid, warehouse, visitorId: env.FRISCO_SID || c.sid || '' }
  }
  throw new Error('Ustaw FRISCO_REFRESH_TOKEN (zalecane) albo FRISCO_COOKIE w .env.')
}

async function fillFriscoCart(session, names) {
  const { token, uid, warehouse, visitorId } = session

  const base = 'https://www.frisco.pl'
  const common = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'x-frisco-warehouse': warehouse,
    'x-frisco-visitorid': visitorId,
    'x-frisco-features': 'MarginBoosting=1',
    origin: base,
    referer: `${base}/`,
    'user-agent': UA,
  }
  const jsonHeaders = { ...common, 'content-type': 'application/json' }
  const cartUrl = `${base}/app/commerce/api/v1/users/${uid}/cart`

  const put = (products) =>
    fetch(cartUrl, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ products }) })
  const clear = () => fetch(`${cartUrl}/products`, { method: 'DELETE', headers: common })

  // 1) clear (PUT is a per-product upsert, not a whole-cart replace)
  const del = await clear()
  if (!del.ok && del.status !== 204) throw new Error(`Czyszczenie koszyka nie powiodło się (${del.status}). Token może być nieważny — odśwież FRISCO_REFRESH_TOKEN / FRISCO_COOKIE.`)

  // 2) search each item, pick an available match
  const added = []
  const notFound = []
  for (const raw of names) {
    const q = clean(raw)
    try {
      const sr = await fetch(
        `${base}/app/commerce/api/v1/offer/products/query?purpose=Listing&pageIndex=1` +
        `&search=${encodeURIComponent(q)}&includeFacets=false&deliveryMethod=Van&pageSize=24&language=pl&disableAutocorrect=false`,
        { headers: common },
      ).then((r) => r.json())
      const pick = (sr.products || []).find((p) => available(p.product))
      if (pick) added.push({ raw, id: pick.productId, name: pick.product.name.pl })
      else notFound.push(raw)
    } catch {
      notFound.push(`${raw} (błąd wyszukiwania)`)
    }
  }
  const seen = new Set()
  const products = []
  for (const a of added) {
    if (!seen.has(a.id)) { seen.add(a.id); products.push({ productId: a.id, quantity: 1 }) }
  }

  // 3) set cart = list
  const putRes = await put(products)
  if (!putRes.ok) throw new Error(`Ustawienie koszyka nie powiodło się (${putRes.status}).`)

  // 4) cart re-validates against the delivery slot — drop what it marks unavailable
  const cart = await fetch(cartUrl, { headers: common, cache: 'no-store' }).then((r) => r.json())
  const keep = []
  const removedUnavailable = []
  for (const it of cart.products || []) {
    if (available(it.product)) keep.push({ productId: it.productId, quantity: it.quantity || 1 })
    else removedUnavailable.push(it.product?.name?.pl || it.productId)
  }
  if (removedUnavailable.length) { await clear(); await put(keep) }

  return { added, notFound, removedUnavailable, inCart: keep.length }
}

// ---- main ------------------------------------------------------------------
async function main() {
  const env = loadEnv()
  const listId = process.argv[2]
  if (!listId) {
    console.error('Użycie: node scripts/frisco-cart.mjs <listId>')
    process.exit(1)
  }
  const base = (env.MBL_BASE_URL || 'https://meal-planner.qunabu.workers.dev').replace(/\/$/, '')
  if (!env.MBL_PIN) throw new Error('Brak MBL_PIN w .env.')
  if (!env.FRISCO_REFRESH_TOKEN && !env.FRISCO_COOKIE) {
    throw new Error('Ustaw FRISCO_REFRESH_TOKEN (zalecane) albo FRISCO_COOKIE w .env.')
  }

  console.log(`→ Pobieram listę #${listId} z ${base} …`)
  const { name, names } = await fetchListFromApp(base, env.MBL_PIN, listId)
  console.log(`  „${name}" — ${names.length} pozycji do dodania.`)

  console.log('→ Uwierzytelniam sesję Frisco …')
  const session = await resolveFriscoSession(env)

  console.log('→ Napełniam koszyk Frisco …')
  const r = await fillFriscoCart(session, names)

  console.log('\n===== WYNIK =====')
  console.log(`W koszyku (dostępne): ${r.inCart}`)
  if (r.notFound.length) {
    console.log(`\n❗ Nie znaleziono (${r.notFound.length}):`)
    for (const n of r.notFound) console.log(`   - ${n}`)
  }
  if (r.removedUnavailable.length) {
    console.log(`\n⚠️  Usunięto jako niedostępne w tym terminie (${r.removedUnavailable.length}):`)
    for (const n of r.removedUnavailable) console.log(`   - ${n}`)
  }
  console.log('\nGotowe. Sprawdź koszyk na frisco.pl i złóż zamówienie samodzielnie.')
  console.log('Uwaga: jeśli u góry koszyka są ostrzeżenia (worek zwrotny / ulotka kaucyjna),')
  console.log('kliknij „Usuń niedostępne produkty" — to pozycje dodawane automatycznie przez Frisco.')
}

main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1) })
