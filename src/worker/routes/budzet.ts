import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { Store, getSettings, setSetting } from '../budzet/store'
import { CATEGORIES } from '../budzet/categories'
import { importCsv, recategoriseAll } from '../budzet/importer'
import { loadRules, seedRulesIfEmpty, syncPersonalRules } from '../budzet/rules'
import * as A from '../budzet/analytics'
import { ebConfig, listAspsps, startAuth, createSession } from '../budzet/enablebanking'
import { saveSessionAccounts, syncConnections } from '../budzet/bank-sync'

const app = new Hono<AppEnv>()
const store = (c: { env: { DB: unknown }; var: { userId: string } }) =>
  new Store(c.env.DB as never, c.var.userId)

/* ---------------- import ---------------- */
app.post('/import', async (c) => {
  const s = store(c)
  const form = await c.req.formData()
  // Typy Workers deklarują FormDataEntryValue jako string — pliki rozpoznajemy po kształcie.
  const files = (form.getAll('files') as unknown[])
    .filter((f): f is { name: string; text: () => Promise<string> } =>
      !!f && typeof f === 'object' && typeof (f as { text?: unknown }).text === 'function')
  if (!files.length) return c.json({ error: 'Brak plików' }, 400)
  const results = []
  for (const f of files) {
    try {
      results.push({ file: f.name, ...(await importCsv(s, await f.text(), f.name)) })
    } catch (e) {
      results.push({ file: f.name, error: (e as Error).message })
    }
  }
  const recategorised = await recategoriseAll(s)
  return c.json({ results, recategorised })
})

app.get('/imports', async (c) =>
  c.json(await store(c).all('SELECT * FROM budzet_imports WHERE user_id = ? ORDER BY id DESC LIMIT 50', c.var.userId)))

/* ---------------- pulpit ---------------- */
app.get('/overview', async (c) => {
  const s = store(c)
  await seedRulesIfEmpty(s)
  const waterfall = await A.monthlyWaterfall(s)
  const complete = A.completeMonths(waterfall)
  return c.json({
    range: await A.range(s),
    months: await A.months(s),
    waterfall,
    complete_months: complete.map((m) => m.month),
    ratios: await A.ratios(s),
    safe_to_save: await A.safeToSave(s),
    emergency: await A.emergencyFund(s),
    coverage: await A.coverage(s),
    accounts: await A.accountFlows(s),
    accruals: await A.accruals(s),
    outstanding_accruals: await A.outstandingAccruals(s),
    settings: await getSettings(s),
  })
})

app.get('/categories', async (c) => {
  const s = store(c)
  const b = c.req.query('business')
  return c.json({
    tree: CATEGORIES,
    breakdown: await A.categoryBreakdown(s, {
      from: c.req.query('from'), to: c.req.query('to'),
      business: b === undefined ? null : Number(b),
    }),
    groups_by_month: await A.groupMonthlySeries(s),
  })
})

app.get('/category/:id', async (c) => {
  const s = store(c)
  const id = c.req.param('id')
  return c.json({
    series: await A.categoryMonthlySeries(s, id),
    merchants: await s.all(
      `SELECT counterparty_norm merchant, COUNT(*) n, ROUND(-SUM(amount),2) total
         FROM budzet_transactions WHERE user_id = ? AND is_internal=0 AND excluded=0
           AND amount<0 AND category_id=? GROUP BY 1 ORDER BY total DESC LIMIT 40`, c.var.userId, id),
  })
})

app.get('/merchants', async (c) => {
  const b = c.req.query('business')
  return c.json(await A.merchants(store(c), {
    from: c.req.query('from'), to: c.req.query('to'),
    limit: Number(c.req.query('limit')) || 60,
    business: b === undefined ? null : Number(b),
  }))
})

app.get('/recurring', async (c) => {
  const s = store(c)
  return c.json({ items: await A.recurring(s), kindergarten: await A.kindergarten(s) })
})

app.get('/trips', async (c) => c.json(await A.trips(store(c))))
app.get('/anomalies', async (c) => c.json(await A.anomalies(store(c), { month: c.req.query('month') })))
app.get('/ratios', async (c) => c.json(await A.ratios(store(c))))
app.get('/review-queue', async (c) => c.json(await A.reviewQueue(store(c))))

/* ---------------- transakcje ---------------- */
app.get('/transactions', async (c) => {
  const s = store(c)
  const q = c.req.query()
  const w = ['user_id = ?']
  const p: unknown[] = [c.var.userId]
  if (q.month) { w.push('month = ?'); p.push(q.month) }
  if (q.category) { w.push('category_id = ?'); p.push(q.category) }
  if (q.account) { w.push('account_id = ?'); p.push(q.account) }
  if (q.merchant) { w.push('counterparty_norm = ?'); p.push(q.merchant) }
  if (q.unclassified === '1') w.push("category_id = 'do_sklasyfikowania'")
  if (q.internal !== '1') w.push('is_internal = 0')
  if (q.q) { w.push('haystack LIKE ?'); p.push(`%${q.q}%`) }
  const where = w.join(' AND ')
  const limit = Math.min(Number(q.limit) || 300, 2000)
  const rows = await s.all(
    `SELECT * FROM budzet_transactions WHERE ${where} ORDER BY booked_on DESC, id DESC LIMIT ? OFFSET ?`,
    ...p, limit, Number(q.offset) || 0)
  const tot = await s.first<{ n: number; s: number }>(
    `SELECT COUNT(*) n, ROUND(SUM(amount),2) s FROM budzet_transactions WHERE ${where}`, ...p)
  return c.json({ rows, total: tot?.n ?? 0, sum: tot?.s ?? 0 })
})

app.patch('/transactions/:id', async (c) => {
  const s = store(c)
  const id = Number(c.req.param('id'))
  const b = await c.req.json<{ category_id?: string; is_business?: boolean; excluded?: boolean; note?: string }>()
  if (b.category_id !== undefined)
    await s.run("UPDATE budzet_transactions SET category_id=?, category_source='manual' WHERE id=? AND user_id=?", b.category_id, id, c.var.userId)
  if (b.is_business !== undefined)
    await s.run("UPDATE budzet_transactions SET is_business=?, business_source='manual' WHERE id=? AND user_id=?", b.is_business ? 1 : 0, id, c.var.userId)
  if (b.excluded !== undefined)
    await s.run('UPDATE budzet_transactions SET excluded=? WHERE id=? AND user_id=?', b.excluded ? 1 : 0, id, c.var.userId)
  if (b.note !== undefined)
    await s.run('UPDATE budzet_transactions SET note=? WHERE id=? AND user_id=?', b.note, id, c.var.userId)
  return c.json(await s.first('SELECT * FROM budzet_transactions WHERE id=? AND user_id=?', id, c.var.userId))
})

app.post('/classify-merchant', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ merchant: string; category_id: string; is_business?: boolean; create_rule?: boolean }>()
  const r = await s.run(
    "UPDATE budzet_transactions SET category_id=?, category_source='manual' WHERE user_id=? AND counterparty_norm=? AND category_source<>'manual'",
    b.category_id, c.var.userId, b.merchant)
  if (b.is_business !== undefined && b.is_business !== null)
    await s.run("UPDATE budzet_transactions SET is_business=?, business_source='manual' WHERE user_id=? AND counterparty_norm=?",
      b.is_business ? 1 : 0, c.var.userId, b.merchant)
  let rule: number | null = null
  if (b.create_rule) {
    const pattern = b.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const ins = await s.run(
      `INSERT INTO budzet_rules(user_id, pattern, category_id, label, is_business, prio, origin, created_at)
       VALUES(?,?,?,?,?,?,'user',?)`,
      c.var.userId, pattern, b.category_id, b.merchant,
      b.is_business === undefined ? null : (b.is_business ? 1 : 0), 500, new Date().toISOString())
    rule = (ins.meta as { last_row_id?: number })?.last_row_id ?? null
  }
  return c.json({ updated: (r.meta as { changes?: number })?.changes ?? 0, rule })
})

/* ---------------- reguły ---------------- */
app.get('/rules', async (c) =>
  c.json(await store(c).all('SELECT * FROM budzet_rules WHERE user_id = ? ORDER BY prio DESC, id', c.var.userId)))

app.post('/rules', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ pattern: string; category_id: string; label?: string
    is_business?: number | null; prio?: number; sign?: '+' | '-' | null }>()
  try { new RegExp(b.pattern, 'i') } catch { return c.json({ error: 'Niepoprawne wyrażenie regularne' }, 400) }
  const r = await s.run(
    `INSERT INTO budzet_rules(user_id, pattern, category_id, label, is_business, sign, prio, origin, created_at)
     VALUES(?,?,?,?,?,?,?,'user',?)`,
    c.var.userId, b.pattern, b.category_id, b.label ?? null, b.is_business ?? null,
    b.sign ?? null, b.prio ?? 500, new Date().toISOString())
  return c.json({ id: (r.meta as { last_row_id?: number })?.last_row_id })
})

app.delete('/rules/:id', async (c) => {
  await store(c).run('DELETE FROM budzet_rules WHERE id=? AND user_id=?', Number(c.req.param('id')), c.var.userId)
  return c.json({ deleted: true })
})

app.post('/recategorise', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ includeManual?: boolean }>().catch(() => ({} as { includeManual?: boolean }))
  return c.json(await recategoriseAll(s, { includeManual: b?.includeManual === true }))
})

/* ---------------- budżety ---------------- */
app.get('/budgets', async (c) => {
  const s = store(c)
  return c.json({
    suggested: await A.suggestBudgets(s),
    current: await s.all('SELECT * FROM budzet_budgets WHERE user_id = ?', c.var.userId),
    status: await A.budgetStatus(s, c.req.query('month')),
  })
})

app.put('/budgets', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ items: { category_id: string; monthly_limit: number; source?: string }[] }>()
  await s.batch((b.items ?? []).map((i) => s.stmt(
    `INSERT INTO budzet_budgets(user_id, category_id, monthly_limit, source) VALUES(?,?,?,?)
     ON CONFLICT(user_id, category_id) DO UPDATE SET monthly_limit=excluded.monthly_limit, source=excluded.source`,
    c.var.userId, i.category_id, i.monthly_limit, i.source ?? 'manual')))
  return c.json({ saved: (b.items ?? []).length })
})

app.delete('/budgets/:id', async (c) => {
  await store(c).run('DELETE FROM budzet_budgets WHERE user_id=? AND category_id=?', c.var.userId, c.req.param('id'))
  return c.json({ deleted: true })
})

/* ---------------- konta, majątek ---------------- */
app.get('/accounts', async (c) => c.json(await A.accountFlows(store(c))))

app.patch('/accounts/:id', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ current_balance?: number; name?: string; short?: string; kind?: string }>()
  const cur = await s.first<Record<string, unknown>>('SELECT * FROM budzet_accounts WHERE user_id=? AND id=?', c.var.userId, c.req.param('id'))
  if (!cur) return c.json({ error: 'Nie znaleziono konta' }, 404)
  await s.run(
    'UPDATE budzet_accounts SET current_balance=?, balance_as_of=?, name=?, short=?, kind=? WHERE user_id=? AND id=?',
    b.current_balance ?? cur.current_balance ?? null, new Date().toISOString().slice(0, 10),
    b.name ?? cur.name, b.short ?? cur.short, b.kind ?? cur.kind, c.var.userId, c.req.param('id'))
  return c.json(await s.first('SELECT * FROM budzet_accounts WHERE user_id=? AND id=?', c.var.userId, c.req.param('id')))
})

app.get('/net-worth', async (c) => c.json(await A.netWorth(store(c))))

app.post('/net-worth', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ kind: string; name: string; category?: string; amount: number; as_of?: string; note?: string }>()
  const r = await s.run(
    'INSERT INTO budzet_net_worth_items(user_id, kind, name, category, amount, as_of, note) VALUES(?,?,?,?,?,?,?)',
    c.var.userId, b.kind, b.name, b.category ?? null, b.amount, b.as_of ?? new Date().toISOString().slice(0, 10), b.note ?? null)
  return c.json({ id: (r.meta as { last_row_id?: number })?.last_row_id })
})

app.delete('/net-worth/:id', async (c) => {
  await store(c).run('DELETE FROM budzet_net_worth_items WHERE id=? AND user_id=?', Number(c.req.param('id')), c.var.userId)
  return c.json({ deleted: true })
})

/* ---------------- zobowiązania i rezerwy ---------------- */
app.get('/accruals', async (c) => {
  const s = store(c)
  return c.json({ items: await A.accruals(s), outstanding: await A.outstandingAccruals(s) })
})

app.post('/accruals', async (c) => {
  const s = store(c)
  const b = await c.req.json<Record<string, unknown>>()
  const r = await s.run(
    `INSERT INTO budzet_accruals(user_id, name, category_id, start_month, end_month, amount_net, vat_rate,
       vat_deductible, is_business, due_month, save_from, note)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    c.var.userId, b.name, b.category_id ?? 'uslugi_firmowe', b.start_month, b.end_month ?? null,
    Number(b.amount_net), b.vat_rate == null ? 0.23 : Number(b.vat_rate),
    b.vat_deductible === false ? 0 : 1, b.is_business === false ? 0 : 1,
    b.due_month ?? null, b.save_from ?? null, b.note ?? null)
  return c.json({ id: (r.meta as { last_row_id?: number })?.last_row_id })
})

app.patch('/accruals/:id', async (c) => {
  const s = store(c)
  const id = Number(c.req.param('id'))
  const cur = await s.first<Record<string, unknown>>('SELECT * FROM budzet_accruals WHERE id=? AND user_id=?', id, c.var.userId)
  if (!cur) return c.json({ error: 'Nie znaleziono' }, 404)
  const b = await c.req.json<Record<string, unknown>>()
  const pick = <T,>(k: string, fallback: T) => (b[k] === undefined ? fallback : b[k])
  await s.run(
    `UPDATE budzet_accruals SET name=?, category_id=?, start_month=?, end_month=?, amount_net=?, vat_rate=?,
       vat_deductible=?, is_business=?, settled=?, settled_on=?, due_month=?, save_from=?, note=?
     WHERE id=? AND user_id=?`,
    pick('name', cur.name), pick('category_id', cur.category_id), pick('start_month', cur.start_month),
    pick('end_month', cur.end_month), Number(pick('amount_net', cur.amount_net)), Number(pick('vat_rate', cur.vat_rate)),
    b.vat_deductible === undefined ? cur.vat_deductible : (b.vat_deductible ? 1 : 0),
    b.is_business === undefined ? cur.is_business : (b.is_business ? 1 : 0),
    b.settled === undefined ? cur.settled : (b.settled ? 1 : 0),
    b.settled ? (b.settled_on ?? new Date().toISOString().slice(0, 10)) : null,
    pick('due_month', cur.due_month), pick('save_from', cur.save_from), pick('note', cur.note),
    id, c.var.userId)
  return c.json(await s.first('SELECT * FROM budzet_accruals WHERE id=? AND user_id=?', id, c.var.userId))
})

app.delete('/accruals/:id', async (c) => {
  await store(c).run('DELETE FROM budzet_accruals WHERE id=? AND user_id=?', Number(c.req.param('id')), c.var.userId)
  return c.json({ deleted: true })
})

app.get('/reserves', async (c) => {
  const s = store(c)
  return c.json({ plan: await A.reservesPlan(s, c.req.query('month')), candidates: await A.reserveCandidates(s) })
})

app.post('/reserves', async (c) => {
  const s = store(c)
  const b = await c.req.json<Record<string, unknown>>()
  const r = await s.run(
    `INSERT INTO budzet_reserves(user_id, name, category_id, amount, period_months, next_due_month, target, note)
     VALUES(?,?,?,?,?,?,?,?)`,
    c.var.userId, b.name, b.category_id ?? 'ubezpieczenia', Number(b.amount),
    Number(b.period_months) || 12, b.next_due_month, b.target ?? 'hub', b.note ?? null)
  return c.json({ id: (r.meta as { last_row_id?: number })?.last_row_id })
})

app.delete('/reserves/:id', async (c) => {
  await store(c).run('DELETE FROM budzet_reserves WHERE id=? AND user_id=?', Number(c.req.param('id')), c.var.userId)
  return c.json({ deleted: true })
})

/* ---------------- automatyczne pobieranie z banku ---------------- */

app.get('/bank/status', async (c) => {
  const s = store(c)
  const configured = !!ebConfig(c.env)
  const connections = await s.all(
    `SELECT c.id, c.aspsp_name, c.aspsp_country, c.status, c.valid_until, c.last_sync_at, c.last_error,
            (SELECT COUNT(*) FROM budzet_bank_accounts a WHERE a.connection_id = c.id AND a.user_id = c.user_id) accounts
       FROM budzet_bank_connections c WHERE c.user_id = ? ORDER BY c.id DESC`, c.var.userId)
  return c.json({ configured, connections })
})

app.get('/bank/aspsps', async (c) => {
  const cfg = ebConfig(c.env)
  if (!cfg) return c.json({ error: 'Enable Banking nie jest skonfigurowane' }, 400)
  const country = c.req.query('country') || 'PL'
  try {
    const r = await listAspsps(cfg, country)
    return c.json({ aspsps: (r.aspsps ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo })) })
  } catch (e) { return c.json({ error: (e as Error).message }, 502) }
})

app.post('/bank/connect', async (c) => {
  const cfg = ebConfig(c.env)
  if (!cfg) return c.json({ error: 'Enable Banking nie jest skonfigurowane' }, 400)
  const b = await c.req.json<{ aspsp_name: string; country?: string; valid_days?: number; psu_type?: 'personal' | 'business' }>()
  const country = b.country || 'PL'
  const days = Math.min(180, Math.max(1, b.valid_days ?? 90))
  const validUntil = new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d+Z$/, '.000Z')
  const state = crypto.randomUUID()
  const psu = {
    ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  }
  const origin = new URL(c.req.url).origin
  const redirectUrl = `${origin}/api/budzet/bank/callback`
  // Stan trzymamy w KV (TTL 15 min) — chroni przed CSRF i wiąże powrót z kontem.
  await c.env.KV.put(`budzet:ebstate:${state}`,
    JSON.stringify({ userId: c.var.userId, aspsp: b.aspsp_name, country, validUntil, psu }),
    { expirationTtl: 900 })
  try {
    const r = await startAuth(cfg, { aspspName: b.aspsp_name, country, redirectUrl, state, validUntil, psu, psuType: b.psu_type ?? 'personal' })
    return c.json({ url: r.url })
  } catch (e) { return c.json({ error: (e as Error).message }, 502) }
})

app.get('/bank/callback', async (c) => {
  const cfg = ebConfig(c.env)
  const code = c.req.query('code')
  const state = c.req.query('state')
  const back = (msg: string) => c.redirect(`/budzet#budzet/ustawienia?bank=${encodeURIComponent(msg)}`)
  if (!cfg || !code || !state) return back('blad')
  const rawState = await c.env.KV.get(`budzet:ebstate:${state}`)
  if (!rawState) return back('stan-wygasl')
  await c.env.KV.delete(`budzet:ebstate:${state}`)
  const st = JSON.parse(rawState) as {
    userId: string; aspsp: string; country: string; validUntil: string
    psu?: { ip?: string; userAgent?: string }
  }
  // Powrót z banku musi trafić do tego samego konta, które rozpoczęło autoryzację.
  if (st.userId !== c.var.userId) return back('niezgodne-konto')

  const s = store(c)
  try {
    const sess = await createSession(cfg, code, st.psu)
    const ins = await s.run(
      `INSERT INTO budzet_bank_connections(user_id, aspsp_name, aspsp_country, session_id, status, valid_until, created_at, psu_ip, psu_user_agent)
       VALUES(?,?,?,?,'AUTHORIZED',?,?,?,?)`,
      c.var.userId, st.aspsp, st.country, sess.session_id,
      sess.access?.valid_until ?? st.validUntil, new Date().toISOString(),
      st.psu?.ip ?? null, st.psu?.userAgent ?? null)
    const connId = (ins.meta as { last_row_id?: number })?.last_row_id as number
    await saveSessionAccounts(s, connId, sess.accounts ?? [])
    return back('polaczono')
  } catch (e) {
    return back('blad-' + encodeURIComponent((e as Error).message.slice(0, 80)))
  }
})

app.post('/bank/sync', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ connection_id?: number }>().catch(() => ({} as { connection_id?: number }))
  try {
    const r = await syncConnections(s, c.env, { connectionId: b?.connection_id })
    await recategoriseAll(s)
    return c.json(r)
  } catch (e) { return c.json({ error: (e as Error).message }, 502) }
})

app.delete('/bank/connections/:id', async (c) => {
  const s = store(c)
  const id = Number(c.req.param('id'))
  await s.run('DELETE FROM budzet_bank_accounts WHERE user_id = ? AND connection_id = ?', c.var.userId, id)
  await s.run('DELETE FROM budzet_bank_connections WHERE user_id = ? AND id = ?', c.var.userId, id)
  return c.json({ deleted: true })
})

/* ---------------- struktura, plan, ustawienia ---------------- */
app.get('/structure', async (c) => c.json(await A.getStructure(store(c))))

app.put('/structure', async (c) => {
  const s = store(c)
  const b = await c.req.json<{ items: { category_id: string; target: string }[] }>()
  await s.batch((b.items ?? []).map((i) => s.stmt(
    `INSERT INTO budzet_category_targets(user_id, category_id, target) VALUES(?,?,?)
     ON CONFLICT(user_id, category_id) DO UPDATE SET target = excluded.target`,
    c.var.userId, i.category_id, i.target)))
  return c.json({ saved: (b.items ?? []).length })
})

app.get('/payout/defaults', async (c) => {
  const s = store(c)
  return c.json({
    defaults: await A.payoutDefaults(s),
    reserve: await A.subkontoReserve(s, {}),
    last_invoice: await s.first(
      `SELECT amount, booked_on FROM budzet_transactions
        WHERE user_id = ? AND category_id='przychod_firmowy' ORDER BY booked_on DESC LIMIT 1`, c.var.userId),
  })
})

app.post('/payout/plan', async (c) => {
  const b = await c.req.json<{ amount?: number; planMonth?: string; overrides?: Record<string, number> }>()
  return c.json(await A.payoutPlan(store(c), b))
})

app.get('/settings', async (c) => c.json(await getSettings(store(c))))

app.put('/settings', async (c) => {
  const s = store(c)
  const b = await c.req.json<Record<string, string>>()
  for (const [k, v] of Object.entries(b ?? {})) await setSetting(s, k, String(v))
  // Nazwisko właściciela i rachunek gospodarstwa generują reguły — odśwież je.
  if ('owner_name' in b || 'household_iban' in b || 'household_label' in b) {
    await syncPersonalRules(s)
    await recategoriseAll(s)
  }
  return c.json(await getSettings(s))
})

export { app as budzetRouter }
