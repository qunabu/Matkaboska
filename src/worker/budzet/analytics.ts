import { Store, getSettings, num } from './store'
import { CATEGORY_BY_ID, CATEGORIES } from './categories'
import { TARGETS, defaultTargetFor } from './structure'

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const LIVE = 'is_internal = 0 AND excluded = 0'
const TRAVEL = ['podroz_loty', 'podroz_nocleg', 'podroz_atrakcje', 'podroz_inne']
const TRAVEL_SQL = `('podroz_loty','podroz_nocleg','podroz_atrakcje','podroz_inne')`

const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const monthAdd = (m: string, i: number) => {
  const [y, mm] = m.split('-').map(Number)
  const t = y * 12 + (mm - 1) + i
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const monthDiff = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number)
  return (by * 12 + bm) - (ay * 12 + am)
}

export async function months(s: Store) {
  const r = await s.all<{ month: string }>(
    `SELECT DISTINCT month FROM budzet_transactions WHERE user_id = ? AND ${LIVE} ORDER BY month`, s.userId)
  return r.map((x) => x.month)
}
export async function range(s: Store) {
  return s.first<{ a: string; b: string }>(
    `SELECT MIN(booked_on) a, MAX(booked_on) b FROM budzet_transactions WHERE user_id = ? AND ${LIVE}`, s.userId)
}

/* ---------------- kaskada ---------------- */
export type WaterfallRow = {
  month: string; brutto: number; inne_wplywy: number; vat_nalezny: number; vat_zaplacony: number
  netto: number; zus: number; pit: number; koszty_firmowe: number; dostepne: number
  wydatki_prywatne: number; transfer_gospod: number; transfer_gospod_out: number; zwrot_gospod: number
  nadwyzka: number; zobowiazania: number; nadwyzka_skorygowana: number
  stopa_oszczedzania: number; stopa_skorygowana: number
}

export async function monthlyWaterfall(s: Store): Promise<WaterfallRow[]> {
  const cfg = await getSettings(s)
  const vatRate = num(cfg.vat_rate, 0.23)
  const rows = await s.all<Record<string, number | string>>(`
    SELECT month,
      SUM(CASE WHEN category_id = 'przychod_firmowy' THEN amount ELSE 0 END) AS brutto,
      SUM(CASE WHEN category_id IN ('przychod_inny','zwrot') AND amount > 0 THEN amount ELSE 0 END) AS inne_wplywy,
      -SUM(CASE WHEN category_id = 'zus' THEN amount ELSE 0 END) AS zus,
      -SUM(CASE WHEN category_id = 'podatek_pit' THEN amount ELSE 0 END) AS pit,
      -SUM(CASE WHEN category_id = 'podatek_vat' THEN amount ELSE 0 END) AS vat_zaplacony,
      -SUM(CASE WHEN amount < 0 AND is_business = 1 AND category_id NOT IN ('podatek_vat','podatek_pit','zus')
                THEN amount ELSE 0 END) AS koszty_firmowe,
      -SUM(CASE WHEN amount < 0 AND is_business = 0 AND category_id NOT IN ('transfer_gospod','zwrot_gospod')
                THEN amount ELSE 0 END) AS wydatki_prywatne,
      -SUM(CASE WHEN category_id = 'transfer_gospod' THEN amount ELSE 0 END) AS transfer_gospod_out,
      SUM(CASE WHEN category_id = 'zwrot_gospod' THEN amount ELSE 0 END) AS zwrot_gospod
    FROM budzet_transactions WHERE user_id = ? AND ${LIVE}
    GROUP BY month ORDER BY month`, s.userId)

  const accrual = await accrualByMonth(s)
  return rows.map((r) => {
    const g = (k: string) => Number(r[k] ?? 0)
    const brutto = g('brutto')
    const vat_nalezny = brutto * (vatRate / (1 + vatRate))
    const netto = brutto - vat_nalezny
    const dostepne = netto + g('inne_wplywy') - g('zus') - g('pit') - g('koszty_firmowe')
    const transfer_gospod = g('transfer_gospod_out') - g('zwrot_gospod')
    const nadwyzka = dostepne - g('wydatki_prywatne') - transfer_gospod
    const month = String(r.month)
    const zobowiazania = accrual[month] ?? 0
    return {
      month, brutto: round(brutto), inne_wplywy: round(g('inne_wplywy')),
      vat_nalezny: round(vat_nalezny), vat_zaplacony: round(g('vat_zaplacony')),
      netto: round(netto), zus: round(g('zus')), pit: round(g('pit')),
      koszty_firmowe: round(g('koszty_firmowe')), dostepne: round(dostepne),
      wydatki_prywatne: round(g('wydatki_prywatne')),
      transfer_gospod: round(transfer_gospod),
      transfer_gospod_out: round(g('transfer_gospod_out')), zwrot_gospod: round(g('zwrot_gospod')),
      nadwyzka: round(nadwyzka), zobowiazania: round(zobowiazania),
      nadwyzka_skorygowana: round(nadwyzka - zobowiazania),
      stopa_oszczedzania: netto > 0 ? round((nadwyzka / netto) * 100) : 0,
      stopa_skorygowana: netto > 0 ? round(((nadwyzka - zobowiazania) / netto) * 100) : 0,
    }
  })
}

/** Miesiące brzegowe są niepełne — nie wchodzą do średnich. */
export function completeMonths(rows: WaterfallRow[]): WaterfallRow[] {
  if (rows.length < 3) return rows
  return rows.slice(1, -1)
}

/* ---------------- zobowiązania memoriałowe ---------------- */
export async function accruals(s: Store) {
  const ms = await months(s)
  const lastMonth = ms[ms.length - 1] || new Date().toISOString().slice(0, 7)
  const rows = await s.all('SELECT * FROM budzet_accruals WHERE user_id = ? ORDER BY settled, start_month', s.userId)
  return rows.map((raw) => {
    const a = raw as unknown as Record<string, unknown>
    const settled = Number(a.settled)
    const startMonth = String(a.start_month)
    const endMonth = a.end_month ? String(a.end_month) : null
    const until = settled ? (String(a.settled_on ?? '').slice(0, 7) || lastMonth)
      : (endMonth && endMonth < lastMonth ? endMonth : lastMonth)
    const n = Math.max(0, monthDiff(startMonth, until) + 1)
    const gross = Number(a.amount_net) * (1 + Number(a.vat_rate))
    const dueMonth = a.due_month ? String(a.due_month) : null
    const accrueUntil = dueMonth && dueMonth > until ? monthAdd(dueMonth, -1) : until
    const nAtDue = Math.max(n, monthDiff(startMonth, accrueUntil) + 1)
    const totalAtDue = gross * nAtDue
    const saveFrom = a.save_from ? String(a.save_from) : lastMonth
    const instalments = dueMonth ? Math.max(1, monthDiff(saveFrom, dueMonth) + 1) : null
    return {
      id: Number(a.id), name: String(a.name), category_id: String(a.category_id),
      amount_net: Number(a.amount_net), vat_rate: Number(a.vat_rate),
      vat_deductible: Number(a.vat_deductible), is_business: Number(a.is_business),
      note: a.note == null ? null : String(a.note), settled_on: a.settled_on == null ? null : String(a.settled_on),
      settled, start_month: startMonth, end_month: endMonth, due_month: dueMonth,
      save_from: saveFrom,
      monthly_net: round(Number(a.amount_net)), monthly_gross: round(gross),
      months_accrued: n, until,
      total_net: round(Number(a.amount_net) * n),
      total_vat: round(Number(a.amount_net) * Number(a.vat_rate) * n),
      total_gross: round(gross * n),
      real_cost: round((Number(a.vat_deductible) ? Number(a.amount_net) : gross) * n),
      months_at_due: nAtDue, total_at_due: round(totalAtDue),
      instalments, instalment: instalments ? round(totalAtDue / instalments) : null,
    }
  })
}

async function accrualByMonth(s: Store): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const a of await accruals(s)) {
    if (a.settled) continue
    for (let i = 0; i < a.months_accrued; i++) {
      const m = monthAdd(a.start_month, i)
      out[m] = round((out[m] ?? 0) + a.monthly_gross)
    }
  }
  return out
}

export async function outstandingAccruals(s: Store) {
  const ms = await months(s)
  const firstMonth = ms[0]
  let inRange = 0, beforeData = 0
  for (const a of await accruals(s)) {
    if (a.settled) continue
    for (let i = 0; i < a.months_accrued; i++) {
      const m = monthAdd(a.start_month, i)
      if (firstMonth && m < firstMonth) beforeData += a.monthly_gross
      else inRange += a.monthly_gross
    }
  }
  return { total: round(inRange + beforeData), in_range: round(inRange), before_data: round(beforeData), first_month: firstMonth }
}

/** Ile z zobowiązań powinno już leżeć na rezerwie w danym miesiącu. */
export async function accrualSchedule(s: Store, month: string) {
  let requiredSoFar = 0, monthlyInstalment = 0
  const items = []
  for (const a of await accruals(s)) {
    if (a.settled) continue
    if (!a.due_month) {
      requiredSoFar += a.total_gross
      items.push({ name: a.name, due_month: null, instalment: null, instalments: null,
        instalments_done: null, required_so_far: round(a.total_gross), total_at_due: round(a.total_gross) })
      continue
    }
    const done = Math.min(a.instalments!, Math.max(0, monthDiff(a.save_from, month) + 1))
    const req = a.instalment! * done
    if (month <= a.due_month) { requiredSoFar += req; monthlyInstalment += a.instalment! }
    items.push({ name: a.name, due_month: a.due_month, instalment: round(a.instalment!),
      instalments: a.instalments, instalments_done: done,
      required_so_far: round(req), total_at_due: round(a.total_at_due) })
  }
  return { month, required_so_far: round(requiredSoFar), monthly_instalment: round(monthlyInstalment), items }
}

/* ---------------- rezerwy cykliczne ---------------- */
export async function reservesPlan(s: Store, month?: string) {
  const ms = await months(s)
  const m = month || monthAdd(ms[ms.length - 1] || new Date().toISOString().slice(0, 7), 1)
  const rows = await s.all<Record<string, unknown>>(
    'SELECT * FROM budzet_reserves WHERE user_id = ? AND active = 1 ORDER BY next_due_month', s.userId)
  const items = rows.map((r) => {
    const period = Math.max(1, Number(r.period_months))
    const monthly = Number(r.amount) / period
    const cycleStart = monthAdd(String(r.next_due_month), -period)
    const done = Math.min(period, Math.max(0, monthDiff(cycleStart, m)))
    return {
      id: Number(r.id), name: String(r.name), target: String(r.target),
      category_id: String(r.category_id), active: Number(r.active),
      note: r.note == null ? null : String(r.note),
      amount: Number(r.amount), period_months: period, next_due_month: String(r.next_due_month),
      monthly: round(monthly), accumulated_target: round(monthly * done),
      months_to_due: monthDiff(m, String(r.next_due_month)),
      annual_cost: round(Number(r.amount) * (12 / period)),
    }
  })
  const byTarget: Record<string, number> = {}
  for (const i of items) byTarget[i.target] = round((byTarget[i.target] ?? 0) + i.monthly)
  return { month: m, items, monthly_total: round(items.reduce((a, b) => a + b.monthly, 0)), by_target: byTarget }
}

export async function reserveCandidates(s: Store) {
  const rare = (await recurring(s)).filter((r) => ['półroczna', 'roczna'].includes(r.cadence) && r.avg_amount >= 200)
  const oneOff = await s.all(`
    SELECT counterparty_norm AS merchant, category_id, COUNT(*) n,
           ROUND(-SUM(amount),2) total, MAX(booked_on) last_seen
      FROM budzet_transactions
     WHERE user_id = ? AND ${LIVE} AND amount < -300
       AND category_id IN ('ubezpieczenia','auto_ubezpieczenie','auto_serwis','dzieci_zajecia','edukacja')
     GROUP BY 1 HAVING n <= 2 ORDER BY total DESC LIMIT 12`, s.userId)
  return {
    recurring: rare.map((r) => ({ merchant: r.merchant, category_id: r.category_id, amount: r.avg_amount, cadence: r.cadence, last_seen: r.last_seen })),
    one_off: oneOff,
  }
}

/* ---------------- kategorie, sprzedawcy ---------------- */
export async function categoryBreakdown(s: Store, o: { from?: string; to?: string; business?: number | null } = {}) {
  const w = [`user_id = ?`, LIVE, 'amount < 0']
  const p: unknown[] = [s.userId]
  if (o.from) { w.push('booked_on >= ?'); p.push(o.from) }
  if (o.to) { w.push('booked_on <= ?'); p.push(o.to) }
  if (o.business !== null && o.business !== undefined) { w.push('is_business = ?'); p.push(o.business) }
  const rows = await s.all<{ category_id: string; n: number; total: number }>(
    `SELECT category_id, COUNT(*) n, -SUM(amount) total FROM budzet_transactions
      WHERE ${w.join(' AND ')} GROUP BY category_id ORDER BY total DESC`, ...p)
  const mrows = await s.all<{ month: string }>(
    `SELECT DISTINCT month FROM budzet_transactions WHERE ${w.join(' AND ')}`, ...p)
  const nMonths = mrows.length || 1
  return rows.map((r) => {
    const c = CATEGORY_BY_ID[r.category_id] ?? { name: r.category_id, group: 'Inne', nature: 'unknown' }
    return { category_id: r.category_id, name: c.name, group: c.group, nature: c.nature,
      n: r.n, total: round(r.total), per_month: round(r.total / nMonths) }
  })
}

export async function categoryMonthlySeries(s: Store, categoryId: string) {
  const rows = await s.all<{ month: string; total: number; n: number }>(
    `SELECT month, -SUM(amount) total, COUNT(*) n FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND category_id = ?
      GROUP BY month ORDER BY month`, s.userId, categoryId)
  return rows.map((r) => ({ ...r, total: round(r.total) }))
}

export async function groupMonthlySeries(s: Store) {
  const rows = await s.all<{ month: string; category_id: string; total: number }>(
    `SELECT month, category_id, -SUM(amount) total FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0
        AND category_id NOT IN ('transfer_gospod','zwrot_gospod')
      GROUP BY month, category_id`, s.userId)
  const out: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    const g = (CATEGORY_BY_ID[r.category_id] ?? { group: 'Inne' }).group
    out[r.month] ??= {}
    out[r.month][g] = round((out[r.month][g] ?? 0) + r.total)
  }
  return out
}

export async function merchants(s: Store, o: { from?: string; to?: string; limit?: number; business?: number | null } = {}) {
  const w = ['user_id = ?', LIVE, 'amount < 0', "category_id NOT IN ('transfer_wlasny','transfer_gospod','zwrot_gospod')"]
  const p: unknown[] = [s.userId]
  if (o.from) { w.push('booked_on >= ?'); p.push(o.from) }
  if (o.to) { w.push('booked_on <= ?'); p.push(o.to) }
  if (o.business !== null && o.business !== undefined) { w.push('is_business = ?'); p.push(o.business) }
  p.push(o.limit ?? 60)
  const rows = await s.all<{ merchant: string; category_id: string; n: number; total: number; avg_ticket: number; first_seen: string; last_seen: string }>(
    `SELECT counterparty_norm AS merchant, category_id, COUNT(*) n, -SUM(amount) total,
            -AVG(amount) avg_ticket, MIN(booked_on) first_seen, MAX(booked_on) last_seen
       FROM budzet_transactions WHERE ${w.join(' AND ')}
      GROUP BY counterparty_norm ORDER BY total DESC LIMIT ?`, ...p)
  return rows.map((r) => ({ ...r, total: round(r.total), avg_ticket: round(r.avg_ticket),
    category_name: CATEGORY_BY_ID[r.category_id]?.name ?? r.category_id }))
}

/* ---------------- płatności cykliczne ---------------- */
export async function recurring(s: Store) {
  const rows = await s.all<{ merchant: string; category_id: string; booked_on: string; amt: number }>(
    `SELECT counterparty_norm AS merchant, category_id, booked_on, -amount AS amt
       FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0
        AND category_id NOT IN ('transfer_wlasny','gotowka','p2p')
      ORDER BY counterparty_norm, booked_on`, s.userId)

  const by = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!by.has(r.merchant)) by.set(r.merchant, [])
    by.get(r.merchant)!.push(r)
  }
  const out = []
  for (const [merchant, txs] of by) {
    if (txs.length < 3) continue
    const days = txs.map((t) => Date.parse(t.booked_on) / 86400000)
    if (days[days.length - 1] - days[0] < 75) continue
    const gaps = []
    for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1])
    const medGap = median(gaps)
    if (medGap < 5 || medGap > 400) continue
    const consistent = gaps.filter((g) => Math.abs(g - medGap) <= Math.max(4, medGap * 0.35)).length / gaps.length
    if (consistent < 0.55) continue
    const amts = txs.map((t) => t.amt)
    const avg = amts.reduce((a, b) => a + b, 0) / amts.length
    const cv = Math.sqrt(amts.reduce((a, b) => a + (b - avg) ** 2, 0) / amts.length) / (avg || 1)
    const cadence = medGap <= 9 ? 'tygodniowa' : medGap <= 18 ? 'co 2 tygodnie'
      : medGap <= 45 ? 'miesięczna' : medGap <= 110 ? 'kwartalna'
      : medGap <= 200 ? 'półroczna' : 'roczna'
    out.push({
      merchant, category_id: txs[0].category_id,
      category_name: CATEGORY_BY_ID[txs[0].category_id]?.name ?? txs[0].category_id,
      n: txs.length, cadence, median_gap_days: Math.round(medGap),
      avg_amount: round(avg), min_amount: round(Math.min(...amts)), max_amount: round(Math.max(...amts)),
      variability: round(cv * 100), annual_cost: round(avg * (365 / medGap)),
      total_paid: round(amts.reduce((a, b) => a + b, 0)),
      first_seen: txs[0].booked_on, last_seen: txs[txs.length - 1].booked_on,
      confidence: round(consistent * 100),
      stale: (Date.now() / 86400000 - days[days.length - 1]) > medGap * 2.5,
    })
  }
  return out.sort((a, b) => b.annual_cost - a.annual_cost)
}

export async function kindergarten(s: Store) {
  const cfg = await getSettings(s)
  const rate = num(cfg.kindergarten_food_rate, 25)
  const txs = await s.all<{ month: string; amt: number }>(
    `SELECT month, -amount amt FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND category_id = 'dzieci_przedszkole' AND amount < 0
      ORDER BY booked_on`, s.userId)
  if (!txs.length) return null
  const base = Math.min(...txs.map((t) => t.amt))
  const avg = txs.reduce((a, b) => a + b.amt, 0) / txs.length
  return {
    food_rate: rate, base_fee: round(base),
    months: txs.map((t) => ({ month: t.month, paid: round(t.amt), food: round(t.amt - base), food_days: Math.round((t.amt - base) / rate) })),
    avg_paid: round(avg), annual: round(avg * 12),
  }
}

/* ---------------- wyjazdy ---------------- */
export async function trips(s: Store, o: { gapDays?: number; minTotal?: number } = {}) {
  const gapDays = o.gapDays ?? 6, minTotal = o.minTotal ?? 400
  const ph = TRAVEL.map(() => '?').join(',')
  const txs = await s.all<{ booked_on: string; amt: number; merchant: string }>(
    `SELECT booked_on, -amount amt, counterparty_norm merchant FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND category_id IN (${ph}) ORDER BY booked_on`,
    s.userId, ...TRAVEL)
  if (!txs.length) return []

  const clusters: (typeof txs)[] = []
  let cur = [txs[0]]
  for (let i = 1; i < txs.length; i++) {
    const gap = (Date.parse(txs[i].booked_on) - Date.parse(txs[i - 1].booked_on)) / 86400000
    if (gap > gapDays) { clusters.push(cur); cur = [] }
    cur.push(txs[i])
  }
  clusters.push(cur)

  const out = []
  for (const c of clusters) {
    const total = c.reduce((a, b) => a + b.amt, 0)
    if (total < minTotal) continue
    const from = c[0].booked_on, to = c[c.length - 1].booked_on
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
    const w = await s.first<{ t: number }>(
      `SELECT -SUM(amount) t FROM budzet_transactions
        WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0
          AND category_id NOT IN ('transfer_gospod','transfer_wlasny','zwrot_gospod')
          AND booked_on BETWEEN ? AND ?`, s.userId, from, to)
    const byMerchant: Record<string, number> = {}
    for (const t of c) byMerchant[t.merchant] = (byMerchant[t.merchant] ?? 0) + t.amt
    const top = Object.entries(byMerchant).sort((a, b) => b[1] - a[1])
    out.push({
      from, to, days, type: days >= 3 && c.length >= 4 ? 'wyjazd' : 'rezerwacja',
      n: c.length, travel_cost: round(total), window_spend: round(w?.t ?? 0), name: top[0][0],
      top_merchants: top.slice(0, 5).map(([m, v]) => ({ merchant: m, total: round(v) })),
    })
  }
  return out.sort((a, b) => b.travel_cost - a.travel_cost)
}

/* ---------------- anomalie, budżety ---------------- */
export async function anomalies(s: Store, o: { month?: string; minDelta?: number } = {}) {
  const minDelta = o.minDelta ?? 300
  const all = await months(s)
  const target = o.month || all[all.length - 1]
  const prior = all.filter((m) => m < target).slice(-6)
  if (prior.length < 3) return { month: target, baseline_months: prior, items: [] }

  const rows = await s.all<{ month: string; category_id: string; total: number }>(
    `SELECT month, category_id, -SUM(amount) total FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0
      GROUP BY month, category_id`, s.userId)
  const hist: Record<string, number[]> = {}, curr: Record<string, number> = {}
  for (const r of rows) {
    if (r.month === target) curr[r.category_id] = r.total
    else if (prior.includes(r.month)) (hist[r.category_id] ??= []).push(r.total)
  }
  const items = []
  for (const [cat, base] of Object.entries(hist)) {
    while (base.length < prior.length) base.push(0)
    const med = median(base)
    const now = curr[cat] ?? 0
    const delta = now - med
    if (Math.abs(delta) < minDelta) continue
    items.push({ category_id: cat, name: CATEGORY_BY_ID[cat]?.name ?? cat,
      current: round(now), baseline: round(med), delta: round(delta),
      pct: med > 0 ? round((delta / med) * 100) : null })
  }
  return { month: target, baseline_months: prior, items: items.sort((a, b) => b.delta - a.delta) }
}

export async function suggestBudgets(s: Store) {
  const rows = await s.all<{ category_id: string; total: number }>(
    `SELECT category_id, month, -SUM(amount) total FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0
        AND category_id NOT IN ('transfer_gospod','zwrot_gospod')
      GROUP BY category_id, month`, s.userId)
  const by: Record<string, number[]> = {}
  for (const r of rows) (by[r.category_id] ??= []).push(r.total)
  const nMonths = (await months(s)).length
  return Object.entries(by).map(([cat, vals]) => {
    while (vals.length < nMonths) vals.push(0)
    const med = median(vals)
    const c = CATEGORY_BY_ID[cat] ?? { name: cat, group: 'Inne', nature: 'unknown' }
    return { category_id: cat, name: c.name, group: c.group, nature: c.nature,
      median: round(med), max: round(Math.max(...vals)), suggested: round(Math.ceil(med / 25) * 25) }
  }).filter((b) => b.median > 0).sort((a, b) => b.median - a.median)
}

export async function budgetStatus(s: Store, month?: string) {
  const all = await months(s)
  const m = month || all[all.length - 1]
  const limits = await s.all<{ category_id: string; monthly_limit: number }>(
    'SELECT category_id, monthly_limit FROM budzet_budgets WHERE user_id = ?', s.userId)
  const spentRows = await s.all<{ category_id: string; t: number }>(
    `SELECT category_id, -SUM(amount) t FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND month = ? GROUP BY category_id`, s.userId, m)
  const spent = Object.fromEntries(spentRows.map((r) => [r.category_id, r.t]))
  return limits.map((l) => {
    const sp = spent[l.category_id] ?? 0
    return { category_id: l.category_id, name: CATEGORY_BY_ID[l.category_id]?.name ?? l.category_id,
      limit: round(l.monthly_limit), spent: round(sp), remaining: round(l.monthly_limit - sp),
      pct: l.monthly_limit > 0 ? round((sp / l.monthly_limit) * 100) : 0, over: sp > l.monthly_limit }
  }).sort((a, b) => b.pct - a.pct)
}

/* ---------------- wskaźniki, konta, majątek ---------------- */
export async function ratios(s: Store) {
  const w = completeMonths(await monthlyWaterfall(s))
  if (!w.length) return null
  const avg = (k: keyof WaterfallRow) => w.reduce((a, b) => a + Number(b[k]), 0) / w.length
  const netto = avg('netto'), nadwyzka = avg('nadwyzka'), nadwyzkaAdj = avg('nadwyzka_skorygowana')
  const brutto = avg('brutto')
  const podatki = avg('zus') + avg('pit') + avg('vat_nalezny')

  const natures = await s.all<{ category_id: string; t: number }>(
    `SELECT category_id, -SUM(amount) t FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0 GROUP BY category_id`, s.userId)
  let fixed = 0, discretionary = 0, variable = 0
  for (const r of natures) {
    const n = CATEGORY_BY_ID[r.category_id]?.nature
    if (n === 'fixed') fixed += r.t
    else if (n === 'discretionary') discretionary += r.t
    else if (n === 'variable') variable += r.t
  }
  const lifeTotal = fixed + discretionary + variable || 1
  const nm = w.length
  return {
    months_analysed: nm,
    avg_brutto: round(brutto), avg_netto: round(netto),
    avg_nadwyzka: round(nadwyzka), avg_nadwyzka_skorygowana: round(nadwyzkaAdj),
    stopa_oszczedzania: netto ? round((nadwyzka / netto) * 100) : 0,
    stopa_oszczedzania_skorygowana: netto ? round((nadwyzkaAdj / netto) * 100) : 0,
    efektywna_stopa_podatkowa: brutto ? round((podatki / brutto) * 100) : 0,
    udzial_kosztow_firmowych: netto ? round((avg('koszty_firmowe') / netto) * 100) : 0,
    udzial_transferu_gospod: netto ? round((avg('transfer_gospod') / netto) * 100) : 0,
    udzial_wydatkow_prywatnych: netto ? round((avg('wydatki_prywatne') / netto) * 100) : 0,
    struktura: {
      stale: round((fixed / lifeTotal) * 100), zmienne: round((variable / lifeTotal) * 100),
      uznaniowe: round((discretionary / lifeTotal) * 100),
      stale_pln: round(fixed / nm), zmienne_pln: round(variable / nm), uznaniowe_pln: round(discretionary / nm),
    },
  }
}

export async function accountFlows(s: Store) {
  return s.all(`
    SELECT a.id, a.name, a.short, a.kind, a.iban, a.current_balance, a.balance_as_of,
           COUNT(t.id) n,
           ROUND(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 2) wplywy,
           ROUND(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 2) wydatki,
           ROUND(SUM(t.amount), 2) netto
      FROM budzet_accounts a
      LEFT JOIN budzet_transactions t ON t.account_id = a.id AND t.user_id = a.user_id AND t.excluded = 0
     WHERE a.user_id = ? GROUP BY a.id ORDER BY a.kind, a.name`, s.userId)
}

export async function emergencyFund(s: Store) {
  const cfg = await getSettings(s)
  const w = completeMonths(await monthlyWaterfall(s))
  if (!w.length) return null
  const travelRows = await s.all<{ month: string; t: number }>(
    `SELECT month, -SUM(amount) t FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0 AND category_id IN ${TRAVEL_SQL} GROUP BY month`, s.userId)
  const travel = Object.fromEntries(travelRows.map((r) => [r.month, r.t]))
  const baselines = w.map((m) => m.wydatki_prywatne - (travel[m.month] ?? 0) + m.transfer_gospod + m.zus + m.pit + m.koszty_firmowe)
  const baseline = median(baselines)
  const targetMonths = num(cfg.emergency_months_target, 6)
  const bal = await s.first<{ b: number }>(
    `SELECT COALESCE(SUM(current_balance),0) b FROM budzet_accounts
      WHERE user_id = ? AND current_balance IS NOT NULL AND kind <> 'credit_card'`, s.userId)
  const balances = bal?.b ?? 0
  return {
    monthly_baseline: round(baseline),
    monthly_baseline_lifestyle_only: round(median(w.map((m) => m.wydatki_prywatne - (travel[m.month] ?? 0) + m.transfer_gospod))),
    target_months: targetMonths, target_amount: round(baseline * targetMonths),
    current_liquid: round(balances),
    months_of_runway: baseline > 0 ? round(balances / baseline) : null,
    gap: round(baseline * targetMonths - balances),
  }
}

export async function safeToSave(s: Store) {
  const cfg = await getSettings(s)
  const w = await monthlyWaterfall(s)
  const complete = completeMonths(w)
  const buffer = num(cfg.company_buffer_target, 15000)
  const acc = cfg.account_business
    ? await s.first<{ b: number }>('SELECT current_balance b FROM budzet_accounts WHERE user_id = ? AND id = ?', s.userId, cfg.account_business)
    : null
  const owed = (await outstandingAccruals(s)).total
  const avgNadwyzka = complete.length ? complete.reduce((a, b) => a + b.nadwyzka, 0) / complete.length : 0
  const avgAdj = complete.length ? complete.reduce((a, b) => a + b.nadwyzka_skorygowana, 0) / complete.length : 0
  const balance = acc?.b ?? null
  return {
    buffer_target: buffer, company_balance: balance, outstanding_accruals: round(owed),
    transferable_now: balance == null ? null : round(Math.max(0, balance - buffer - owed)),
    avg_monthly_surplus: round(avgNadwyzka),
    avg_monthly_surplus_adjusted: round(avgAdj),
    last_month: complete[complete.length - 1] ?? null,
    recommended_monthly_transfer: round(Math.max(0, Math.floor(avgAdj / 100) * 100)),
  }
}

export async function netWorth(s: Store) {
  const manual = await s.all<{ id: number; kind: string; name: string; category: string; amount: number }>(
    'SELECT * FROM budzet_net_worth_items WHERE user_id = ? ORDER BY kind, amount DESC', s.userId)
  const accounts = await s.all<{ name: string; kind: string; current_balance: number }>(
    'SELECT name, kind, current_balance FROM budzet_accounts WHERE user_id = ? AND current_balance IS NOT NULL', s.userId)
  // Karta kredytowa: ujemne saldo to dług, dodatnie to nadpłata. Wcześniej
  // dodatnie było po cichu pomijane — teraz obie strony trafiają do zestawienia.
  const cards = accounts.filter((a) => a.kind === 'credit_card')
  const assets: Record<string, unknown>[] = accounts
    .filter((a) => a.kind !== 'credit_card')
    .map((a) => ({ kind: 'asset', name: a.name, category: 'Rachunki', amount: a.current_balance, source: 'account' }))
    .concat(cards.filter((a) => a.current_balance > 0)
      .map((a) => ({ kind: 'asset', name: `${a.name} (nadpłata)`, category: 'Karty', amount: a.current_balance, source: 'account' })))
    .concat(manual.filter((m) => m.kind === 'asset').map((m) => ({ ...m, source: 'manual' })))
  const liabilities: Record<string, unknown>[] = cards
    .filter((a) => a.current_balance < 0)
    .map((a) => ({ kind: 'liability', name: a.name, category: 'Karty', amount: Math.abs(a.current_balance), source: 'account' }))
    .concat(manual.filter((m) => m.kind === 'liability').map((m) => ({ ...m, source: 'manual' })))
  for (const a of await accruals(s)) {
    if (a.settled) continue
    liabilities.push({ kind: 'liability', name: `${a.name} (niezafakturowane, ${a.months_accrued} mies.)`,
      category: 'Zobowiązania memoriałowe', amount: a.total_gross, source: 'accrual' })
  }
  const ta = assets.reduce((x, a) => x + Number(a.amount), 0)
  const tl = liabilities.reduce((x, a) => x + Number(a.amount), 0)
  return { assets, liabilities, total_assets: round(ta), total_liabilities: round(tl), net_worth: round(ta - tl) }
}

export async function reviewQueue(s: Store, limit = 200) {
  return s.all(`
    SELECT counterparty_norm merchant, COUNT(*) n, ROUND(SUM(amount),2) total,
           MIN(booked_on) first_seen, MAX(booked_on) last_seen,
           GROUP_CONCAT(DISTINCT bank_category) bank_categories,
           MIN(id) sample_id, MAX(description) sample_desc
      FROM budzet_transactions
     WHERE user_id = ? AND ${LIVE} AND category_id = 'do_sklasyfikowania'
     GROUP BY counterparty_norm ORDER BY ABS(SUM(amount)) DESC LIMIT ?`, s.userId, limit)
}

export async function coverage(s: Store) {
  const t = await s.first<{ unknown: number; total: number; unknown_n: number; n: number }>(`
    SELECT ROUND(SUM(CASE WHEN category_id='do_sklasyfikowania' THEN -amount ELSE 0 END),2) unknown,
           ROUND(SUM(-amount),2) total,
           SUM(CASE WHEN category_id='do_sklasyfikowania' THEN 1 ELSE 0 END) unknown_n,
           COUNT(*) n
      FROM budzet_transactions WHERE user_id = ? AND ${LIVE} AND amount < 0`, s.userId)
  const total = t?.total ?? 0
  return { ...t, pct: total ? round(((t?.unknown ?? 0) / total) * 100) : 0 }
}

/* ---------------- struktura kont ---------------- */
export async function getStructure(s: Store) {
  const rows = await s.all<{ category_id: string; target: string }>(
    'SELECT category_id, target FROM budzet_category_targets WHERE user_id = ?', s.userId)
  const map = Object.fromEntries(rows.map((r) => [r.category_id, r.target]))
  return { targets: TARGETS, categories: CATEGORIES.map((c) => ({ ...c, target: map[c.id] ?? defaultTargetFor(c.id) })) }
}

async function categoriesFor(s: Store, target: string): Promise<string[]> {
  const rows = await s.all<{ category_id: string }>(
    'SELECT category_id FROM budzet_category_targets WHERE user_id = ? AND target = ?', s.userId, target)
  if (rows.length) return rows.map((r) => r.category_id)
  return CATEGORIES.filter((c) => defaultTargetFor(c.id) === target).map((c) => c.id)
}

/* ---------------- plan wypłaty ---------------- */
async function medianMonthlySpend(s: Store, sql: string, params: unknown[] = []) {
  const all = await months(s)
  const edge = new Set([all[0], all[all.length - 1]])
  const rows = await s.all<{ month: string; t: number }>(sql, ...params)
  return median(rows.filter((r) => !edge.has(r.month)).map((r) => r.t))
}

async function needForTarget(s: Store, target: string, useMean = false) {
  const cats = await categoriesFor(s, target)
  if (!cats.length) return 0
  const ph = cats.map(() => '?').join(',')
  const sql = `SELECT month, -SUM(amount) t FROM budzet_transactions
                WHERE user_id = ? AND ${LIVE} AND amount < 0 AND is_business = 0
                  AND category_id IN (${ph}) GROUP BY month`
  if (!useMean) return medianMonthlySpend(s, sql, [s.userId, ...cats])
  // Pozycje skokowe (wyjazdy): mediana bywa zerowa, odkładać trzeba średnią.
  const w = completeMonths(await monthlyWaterfall(s))
  const rows = await s.all<{ month: string; t: number }>(sql, s.userId, ...cats)
  const byMonth = Object.fromEntries(rows.map((r) => [r.month, r.t]))
  return w.length ? w.reduce((x, m) => x + (byMonth[m.month] ?? 0), 0) / w.length : 0
}

/**
 * Udział VAT naliczonego, o który pomniejszamy prowizję na subkonto.
 *
 * NIE wyprowadzamy go z historii: płatności VAT w oknie danych rozliczają
 * kwartały sprzed tego okna, więc porównanie „należny minus zapłacony" daje
 * wynik przypadkowy (na realnych danych wychodziło raz 4%, raz −15%).
 * Domyślnie 0 — przy odkładaniu bezpieczniej mieć nadwyżkę niż niedobór.
 * Kto zna swój rzeczywisty udział, ustawia go świadomie w ustawieniach.
 */
async function inputVatShare(s: Store) {
  const cfg = await getSettings(s)
  const v = num(cfg.vat_input_share, 0)
  return Math.min(0.5, Math.max(0, v))
}

export async function payoutDefaults(s: Store) {
  const cfg = await getSettings(s)
  const vatRate = num(cfg.vat_rate, 0.23)

  const companyCosts = await medianMonthlySpend(s,
    `SELECT month, -SUM(amount) t FROM budzet_transactions
      WHERE user_id = ?1 AND ${LIVE} AND amount < 0 AND is_business = 1
        AND (?2 = '' OR account_id <> ?2)
        AND category_id NOT IN ('podatek_vat','podatek_pit','zus')
      GROUP BY month`, [s.userId, cfg.account_tax || ''])

  const daily = await needForTarget(s, 'daily')
  // Średnia bywa wyższa od mediany przez drogie miesiące — tę różnicę dopłacasz
  // z PKO, więc plan musi ją pokazywać jako odpływ z oszczędności, nie ukrywać.
  const dailyMean = await needForTarget(s, 'daily', true)
  const hub = await needForTarget(s, 'hub')
  const savingsGoal = await needForTarget(s, 'savings', true)

  const hhLabel = cfg.household_label || cfg.household_iban || ''
  const ing = hhLabel
    ? await medianMonthlySpend(s,
        `SELECT month, -SUM(amount) t FROM budzet_transactions
          WHERE user_id = ? AND category_id = 'transfer_gospod' AND haystack LIKE ? GROUP BY month`,
        [s.userId, `%${hhLabel}%`])
    : await medianMonthlySpend(s,
        `SELECT month, -SUM(amount) t FROM budzet_transactions
          WHERE user_id = ? AND category_id = 'transfer_gospod' GROUP BY month`, [s.userId])
  const otherHhRows = hhLabel
    ? await s.all<{ t: number }>(
        `SELECT month, -SUM(amount) t FROM budzet_transactions
          WHERE user_id = ? AND category_id = 'transfer_gospod' AND haystack NOT LIKE ? GROUP BY month`,
        s.userId, `%${hhLabel}%`)
    : []
  const nMonths = completeMonths(await monthlyWaterfall(s)).length || 1
  const adhocHousehold = otherHhRows.reduce((a, b) => a + b.t, 0) / nMonths

  const subkontoOther = cfg.account_tax
    ? await medianMonthlySpend(s,
        `SELECT month, -SUM(amount) t FROM budzet_transactions
          WHERE user_id = ? AND account_id = ? AND amount < 0
            AND category_id NOT IN ('podatek_vat','podatek_pit','zus','transfer_wlasny')
          GROUP BY month`, [s.userId, cfg.account_tax])
    : 0

  const zusRows = await s.all<{ z: number }>(
    `SELECT -amount z FROM budzet_transactions WHERE user_id = ? AND category_id='zus' ORDER BY booked_on DESC LIMIT 3`, s.userId)
  const pitRows = await s.all<{ month: string; t: number }>(
    `SELECT month, -SUM(amount) t FROM budzet_transactions WHERE user_id = ? AND category_id='podatek_pit'
      GROUP BY month ORDER BY month DESC LIMIT 6`, s.userId)
  const nettoByMonth = Object.fromEntries((await monthlyWaterfall(s)).map((w) => [w.month, w.netto]))
  const pitRatios = pitRows.filter((r) => (nettoByMonth[r.month] ?? 0) > 0).map((r) => r.t / nettoByMonth[r.month])

  // Kwoty ustalone przez użytkownika mają pierwszeństwo przed medianą z historii.
  const fixedIng = cfg.household_fixed !== '' ? num(cfg.household_fixed, 0) : null
  const fixedAdhoc = cfg.household_adhoc_fixed !== '' ? num(cfg.household_adhoc_fixed, 0) : null

  return {
    vat_rate: vatRate,
    pit_rate_of_net: round((median(pitRatios) || 0.112) * 10000) / 10000,
    zus_monthly: round(median(zusRows.map((r) => r.z)) || 0),
    subkonto_other_monthly: round(subkontoOther),
    company_costs_monthly: round(companyCosts),
    household_monthly: fixedIng ?? round(ing),
    household_adhoc_monthly: fixedAdhoc ?? round(adhocHousehold),
    mbank_monthly: round(daily),
    mbank_mean_monthly: round(dailyMean),
    pko_monthly: round(hub),
    travel_goal_monthly: round(savingsGoal),
    company_buffer_target: num(cfg.company_buffer_target, 15000),
  }
}

/**
 * Do kiedy VAT jest rozliczony. Przelew do US w miesiącu M reguluje kwartał,
 * który zakończył się przed M (termin: 25. dnia po końcu kwartału). Wszystko
 * zafakturowane po tej dacie jest wciąż nieopłacone.
 *
 * Liczenie „VAT-u bieżącego kwartału" było błędne: zaraz po przełomie kwartału
 * rezerwa spadała, mimo że VAT za poprzedni kwartał czekał jeszcze na zapłatę.
 */
function vatClearedThrough(lastPaymentDate: string | null): string {
  if (!lastPaymentDate) return '0000-01-01'
  const [y, m] = lastPaymentDate.slice(0, 7).split('-').map(Number)
  const q = Math.floor((m - 1) / 3)          // kwartał, w którym zapłacono
  const endMonth = q * 3                      // koniec POPRZEDNIEGO kwartału
  if (endMonth === 0) return `${y - 1}-12-31`
  const lastDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth - 1]
  return `${y}-${String(endMonth).padStart(2, '0')}-${lastDay}`
}

function quarterLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`
}

export async function subkontoReserve(s: Store, o: { planMonth?: string; plannedGross?: number } = {}) {
  const plannedGross = o.plannedGross ?? 0
  const all = await months(s)
  const month = o.planMonth || monthAdd(all[all.length - 1] || new Date().toISOString().slice(0, 7), 1)
  const cfg = await getSettings(s)
  const vatRate = num(cfg.vat_rate, 0.23)
  const d = await payoutDefaults(s)
  const inputShare = await inputVatShare(s)

  const lastVat = await s.first<{ d: string }>(
    `SELECT MAX(booked_on) d FROM budzet_transactions WHERE user_id = ? AND category_id='podatek_vat'`, s.userId)
  const clearedThrough = vatClearedThrough(lastVat?.d ?? null)
  const gq = await s.first<{ s: number }>(
    `SELECT COALESCE(SUM(amount),0) s FROM budzet_transactions
      WHERE user_id = ? AND category_id='przychod_firmowy' AND booked_on > ?`, s.userId, clearedThrough)
  const inData = await s.first<{ c: number }>(
    `SELECT COUNT(*) c FROM budzet_transactions WHERE user_id = ? AND category_id='przychod_firmowy' AND month = ?`, s.userId, month)
  const quarterGross = (gq?.s ?? 0) + ((inData?.c ?? 0) > 0 ? 0 : plannedGross)
  const vatDue = quarterGross * (vatRate / (1 + vatRate)) * (1 - inputShare)
  const vatPaid = 0   // wszystko po `clearedThrough` jest z definicji niezapłacone

  const netto = plannedGross ? plannedGross - plannedGross * (vatRate / (1 + vatRate)) : 0
  const pitDue = netto * d.pit_rate_of_net
  const sched = await accrualSchedule(s, month)
  const bal = cfg.account_tax
    ? await s.first<{ b: number }>('SELECT current_balance b FROM budzet_accounts WHERE user_id = ? AND id = ?', s.userId, cfg.account_tax)
    : null
  const balance = bal?.b ?? null

  const required = Math.max(0, vatDue - vatPaid) + pitDue + d.zus_monthly + d.subkonto_other_monthly + sched.required_so_far
  return {
    plan_month: month, quarter: quarterLabel(month), quarter_gross: round(quarterGross),
    vat_cleared_through: clearedThrough,
    vat_due: round(Math.max(0, vatDue - vatPaid)), pit_due: round(pitDue),
    zus_due: round(d.zus_monthly), other_due: round(d.subkonto_other_monthly),
    accrued_liabilities: round(sched.required_so_far), accrual_schedule: sched,
    required: round(required), balance,
    transfer: balance == null ? null : round(Math.max(0, required - balance)),
    surplus: balance == null ? null : round(Math.max(0, balance - required)),
  }
}

export async function payoutPlan(s: Store, o: {
  amount?: number; planMonth?: string; overrides?: Record<string, number>
  /** Jednorazowa premia podana NETTO — doliczamy VAT, bo wchodzi na fakturę. */
  bonusNet?: number
} = {}) {
  const base = await payoutDefaults(s)
  const d = { ...base, ...(o.overrides ?? {}) }
  const invoice = Number(o.amount) || 0
  const bonusNet = Number(o.bonusNet) || 0
  const bonusGross = round(bonusNet * (1 + d.vat_rate))
  const gross = invoice + bonusGross
  const vat = gross * (d.vat_rate / (1 + d.vat_rate))
  const netto = gross - vat
  const pit = netto * d.pit_rate_of_net
  const inputShare = await inputVatShare(s)

  const res = await subkontoReserve(s, { planMonth: o.planMonth, plannedGross: gross })
  const accrualMonthly = res.accrual_schedule.monthly_instalment
  const rp = await reservesPlan(s, res.plan_month)
  const resFor = (t: string) => round(rp.by_target[t] ?? 0)

  const provision = round(vat * (1 - inputShare) + pit + d.zus_monthly + d.subkonto_other_monthly
    + accrualMonthly + resFor('tax'))
  // Cel: subkonto ma pokrywać dokładnie należne zobowiązania — ani mniej, ani
  // więcej. Gdy znamy saldo, przelewamy różnicę do wymaganej rezerwy; pełną
  // prowizję miesięczną bierzemy tylko wtedy, gdy salda nie znamy. Bez tego
  // nadwyżka narosła w poprzednich miesiącach leżałaby bezczynnie.
  const catchUp = res.transfer == null ? 0 : round(Math.max(0, res.transfer - provision))
  const toSubkonto = res.transfer == null ? provision : res.transfer

  const keepCompany = round(d.company_costs_monthly + resFor('business'))
  const toPrivate = round(gross - toSubkonto - keepCompany)
  const toIng = round(d.household_monthly)
  const toHouseholdAdhoc = round(d.household_adhoc_monthly || 0)
  const toMbank = round(d.mbank_monthly + resFor('daily'))
  const pkoSpend = round(d.pko_monthly + resFor('hub'))
  // Na PKO zostaje wszystko, czego nie wysłano dalej. Wydatki własne PKO (większe,
  // losowe, wakacje) NIE są przelewem — schodzą z tego samego salda później, więc
  // odejmowanie ich tutaj rozjeżdżało sumę i zaniżało „ile mam odłożone".
  const savings = round(toPrivate - toIng - toHouseholdAdhoc - toMbank)
  // Stan docelowy liczymy od PEŁNEJ prowizji miesięcznej, nie od tegomiesięcznej
  // wpłaty. W miesiącu, w którym subkonto ma nadwyżkę z przeszłości, przelew jest
  // mniejszy i „oszczędności" wyglądają na wyższe, niż wynika z powtarzalnego rytmu.
  // Stan docelowy to zwykły miesiąc: sama faktura, bez jednorazowej premii i przy
  // pełnej prowizji podatkowej. Inaczej miesiąc z premią wyglądałby jak norma.
  const steadyVat = invoice * (d.vat_rate / (1 + d.vat_rate))
  const steadyPit = (invoice - steadyVat) * d.pit_rate_of_net
  const steadyProvision = round(steadyVat * (1 - inputShare) + steadyPit + d.zus_monthly
    + d.subkonto_other_monthly + accrualMonthly + resFor('tax'))
  const privateAtProvision = round(invoice - steadyProvision - keepCompany)
  const savingsSteady = round(privateAtProvision - toIng - toHouseholdAdhoc - toMbank)

  const w = completeMonths(await monthlyWaterfall(s))
  const avgAdj = w.length ? w.reduce((a, b) => a + b.nadwyzka_skorygowana, 0) / w.length : 0

  const spendRows = await s.all<{ month: string; t: number }>(
    `SELECT month, -SUM(amount) t FROM budzet_transactions
      WHERE user_id = ? AND ${LIVE} AND amount < 0
        AND category_id NOT IN ('podatek_vat','podatek_pit','zus','zwrot_gospod')
        AND category_id NOT IN ${TRAVEL_SQL}
      GROUP BY month`, s.userId)
  const spendNoTravel = Object.fromEntries(spendRows.map((r) => [r.month, r.t]))
  const avgSpendNoTravel = w.length ? w.reduce((a, b) => a + (spendNoTravel[b.month] ?? 0), 0) / w.length : 0
  const avgTravel = d.travel_goal_monthly ?? 0
  const plannedSpend = keepCompany + toMbank + pkoSpend + toHouseholdAdhoc + toIng
  // Z salda PKO schodzą jeszcze większe/losowe wydatki i wyjazdy — dopiero po nich
  // widać, o ile oszczędności realnie rosną.
  // Z PKO nie płacisz bezpośrednio — zasilasz mBank, gdy w drogim miesiącu
  // brakuje, i finansujesz wyjazdy. To są jedyne odpływy z oszczędności.
  const dopłatyDoMbank = round(Math.max(0, (d.mbank_mean_monthly ?? toMbank) - toMbank))
  const pkoOutflow = round(pkoSpend + dopłatyDoMbank + avgTravel)
  const realSavings = round(savingsSteady - pkoSpend - dopłatyDoMbank)

  const cfgAll = await getSettings(s)
  // Struktura zaczyna obowiązywać od wpływu faktury w danym miesiącu, nie od 1.
  // dnia — do tego czasu pieniądze rozchodzą się jeszcze po staremu.
  const sf = cfgAll.structure_from || ''
  let structureStart: { month: string; date: string | null } | null = null
  if (sf) {
    const first = await s.first<{ d: string }>(
      `SELECT MIN(booked_on) d FROM budzet_transactions
        WHERE user_id = ? AND category_id = 'przychod_firmowy' AND month = ?`, s.userId, sf)
    structureStart = { month: sf, date: first?.d ?? null }
  }
  return {
    structure_from: structureStart,
    input: {
      gross: round(gross), netto: round(netto), vat: round(vat),
      invoice: round(invoice), bonus_net: round(bonusNet), bonus_gross: bonusGross,
    },
    params: d, reserve: res, reserves: rp,
    subkonto: {
      total: round(toSubkonto), provision, provision_steady: steadyProvision, catch_up: catchUp,
      lines: [
        { label: 'VAT od tej faktury (po odliczeniu naliczonego)', value: round(vat * (1 - inputShare)) },
        { label: 'PIT-28 (ryczałt)', value: round(pit) },
        { label: 'ZUS', value: round(d.zus_monthly) },
        { label: 'Stałe obciążenia subkonta', value: round(d.subkonto_other_monthly) },
        { label: 'Rata na zobowiązania z terminem', value: round(accrualMonthly) },
        { label: 'Rezerwy na wydatki cykliczne', value: resFor('tax') },
      ],
    },
    company: { keep: keepCompany, buffer_target: d.company_buffer_target },
    private: { total: toPrivate, ing: toIng, adhoc: toHouseholdAdhoc, mbank: toMbank, pko_spend: pkoSpend, savings },
    steady: {
      savings: savingsSteady,
      pko_spend: round(pkoSpend),
      mbank_topups: dopłatyDoMbank,
      travel_monthly: round(avgTravel),
      pko_outflow: pkoOutflow,
      real_savings: realSavings,
      net_accumulation: round(savingsSteady - pkoOutflow),
      avg_spend_no_travel: round(avgSpendNoTravel), planned_spend: round(plannedSpend),
    },
    warnings: {
      avg_adjusted_surplus: round(avgAdj), savings_negative: savings < 0, catch_up: catchUp,
      plan_vs_actual: round(plannedSpend - avgSpendNoTravel),
    },
  }
}
