import { SEED_RULES, type SeedRule } from './seed-rules'
import { BANK_CATEGORY_MAP } from './bank-categories'
import { Store, getSettings } from './store'

export type Rule = {
  id: number; pattern: string; category_id: string; label: string | null
  is_business: number | null; sign: string | null; prio: number; enabled: number
  origin: string; hits: number
  re?: RegExp
}

/**
 * Reguły wynikające z danych użytkownika, a nie z katalogu sieci handlowych.
 * Trzymamy je poza repozytorium — powstają z ustawień konta.
 */
export function personalRules(cfg: Record<string, string>): SeedRule[] {
  const out: SeedRule[] = []
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Rachunek gospodarstwa domowego (np. konto współmałżonka) — przed regułą
  // nazwiska, bo przelew tam też zawiera nazwisko właściciela.
  const hh = [cfg.household_iban, cfg.household_label].filter(Boolean).map(esc)
  if (hh.length) {
    out.push({ pattern: hh.join('|'), category: 'transfer_gospod',
      label: 'Transfer do gospodarstwa', business: false, prio: 995, sign: null })
  }
  // Przelewy między własnymi rachunkami rozpoznajemy po nazwisku właściciela.
  if (cfg.owner_name) {
    const parts = cfg.owner_name.trim().split(/\s+/).map(esc)
    const variants = [esc(cfg.owner_name), parts.slice().reverse().join(' ')]
    out.push({ pattern: [...new Set(variants)].join('|'), category: 'transfer_wlasny',
      label: 'Przelew własny', business: null, prio: 980, sign: null })
  }
  return out
}

export async function seedRulesIfEmpty(s: Store): Promise<number> {
  const row = await s.first<{ c: number }>('SELECT COUNT(*) c FROM budzet_rules WHERE user_id = ?', s.userId)
  if ((row?.c ?? 0) > 0) return 0
  const cfg = await getSettings(s)
  const all = [...SEED_RULES, ...personalRules(cfg)]
  const now = new Date().toISOString()
  await s.batch(all.map((r) => s.stmt(
    `INSERT INTO budzet_rules(user_id, pattern, category_id, label, is_business, sign, prio, origin, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    s.userId, r.pattern, r.category, r.label ?? null,
    r.business === null || r.business === undefined ? null : (r.business ? 1 : 0),
    r.sign ?? null, r.prio, 'seed', now)))
  return all.length
}

/** Odświeża reguły wyprowadzone z ustawień (nazwisko, rachunek gospodarstwa). */
export async function syncPersonalRules(s: Store) {
  const cfg = await getSettings(s)
  await s.run("DELETE FROM budzet_rules WHERE user_id = ? AND origin = 'personal'", s.userId)
  const rules = personalRules(cfg)
  if (!rules.length) return 0
  const now = new Date().toISOString()
  await s.batch(rules.map((r) => s.stmt(
    `INSERT INTO budzet_rules(user_id, pattern, category_id, label, is_business, sign, prio, origin, created_at)
     VALUES(?,?,?,?,?,?,?,'personal',?)`,
    s.userId, r.pattern, r.category, r.label ?? null,
    r.business === null ? null : (r.business ? 1 : 0), r.sign ?? null, r.prio, now)))
  return rules.length
}

export async function loadRules(s: Store): Promise<Rule[]> {
  const rows = await s.all<Rule>(
    'SELECT * FROM budzet_rules WHERE user_id = ? AND enabled = 1 ORDER BY prio DESC, id ASC', s.userId)
  const out: Rule[] = []
  for (const r of rows) {
    try { out.push({ ...r, re: new RegExp(r.pattern, 'i') }) } catch { /* wadliwa reguła — pomijamy */ }
  }
  return out
}

export function matchRule(rules: Rule[], haystack: string, amount: number | null = null): Rule | null {
  for (const r of rules) {
    if (r.sign === '+' && !(amount != null && amount > 0)) continue
    if (r.sign === '-' && !(amount != null && amount < 0)) continue
    if (r.re!.test(haystack)) return r
  }
  return null
}

export function matchBankCategory(bankCategory: string | null | undefined): string | null {
  if (!bankCategory) return null
  return BANK_CATEGORY_MAP[bankCategory.trim()] || null
}

/** Reguła nie rozstrzyga charakteru wydatku → decyduje typ konta. */
export function inferBusiness(ruleBusiness: number | null | undefined, accountKind: string) {
  if (ruleBusiness !== null && ruleBusiness !== undefined) return { value: ruleBusiness, source: 'rule' }
  if (accountKind === 'business' || accountKind === 'tax_reserve') return { value: 1, source: 'account' }
  return { value: 0, source: 'account' }
}
