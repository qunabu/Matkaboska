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
 *   MBL_BASE_URL   default https://meal-planner.qunabu.workers.dev
 *   MBL_PIN        PIN gate for the app API (required to read the list)
 *   FRISCO_COOKIE  your Frisco cookie header, pasted from the browser
 *                  (DevTools → Network → any /app/commerce request → Request
 *                  Headers → Cookie). The access token lives ~10 min, so paste
 *                  a fresh one right before running.
 *
 * What it does NOT do: log in with your password, and place/pay for the order.
 * You review the cart and check out yourself.
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

async function fillFriscoCart(cookieHeader, names) {
  const c = parseCookie(cookieHeader)
  const token = decodeURIComponent(c.sessionIdN || '')
  const uid = c.userIdN
  const warehouse = c.warehouse || 'GDA'
  const visitorId = c.sid || c['x-frisco-visitorid'] || ''
  if (!token || !uid) throw new Error('FRISCO_COOKIE nie zawiera sessionIdN / userIdN — wklej pełne ciasteczko z przeglądarki.')

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
  if (!del.ok && del.status !== 204) throw new Error(`Czyszczenie koszyka nie powiodło się (${del.status}). Token może być nieważny — wklej świeży FRISCO_COOKIE.`)

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
  if (!env.FRISCO_COOKIE) throw new Error('Brak FRISCO_COOKIE w .env (wklej ciasteczko z przeglądarki).')

  console.log(`→ Pobieram listę #${listId} z ${base} …`)
  const { name, names } = await fetchListFromApp(base, env.MBL_PIN, listId)
  console.log(`  „${name}" — ${names.length} pozycji do dodania.`)

  console.log('→ Napełniam koszyk Frisco …')
  const r = await fillFriscoCart(env.FRISCO_COOKIE, names)

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
