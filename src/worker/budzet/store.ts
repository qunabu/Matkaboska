import type { D1Database } from '@cloudflare/workers-types'

/** Cienka warstwa nad D1. Każde zapytanie dostaje user_id jawnie — brak
 *  domyślnego scope'u wymusza świadome pisanie zapytań wielodostępowych. */
export class Store {
  constructor(readonly d1: D1Database, readonly userId: string) {}

  async all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
    const r = await this.d1.prepare(sql).bind(...args).all()
    return (r.results ?? []) as T[]
  }
  async first<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | null> {
    return (await this.d1.prepare(sql).bind(...args).first()) as T | null
  }
  async run(sql: string, ...args: unknown[]) {
    return this.d1.prepare(sql).bind(...args).run()
  }
  stmt(sql: string, ...args: unknown[]) {
    return this.d1.prepare(sql).bind(...args)
  }
  /** D1 nie ma transakcji synchronicznych — batch jest atomowy i szybszy niż pętla. */
  async batch(stmts: ReturnType<D1Database['prepare']>[]) {
    if (!stmts.length) return
    const CHUNK = 90
    for (let i = 0; i < stmts.length; i += CHUNK) {
      await this.d1.batch(stmts.slice(i, i + CHUNK) as never)
    }
  }
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  vat_rate: '0.23',
  company_buffer_target: '15000',
  kindergarten_food_rate: '25',
  emergency_months_target: '6',
  // Role rachunków — ustawiane przez użytkownika po pierwszym imporcie.
  account_business: '',
  account_tax: '',
  account_daily: '',
  account_hub: '',
  // Dane własne: nazwisko właściciela (wykrywanie przelewów między swoimi kontami)
  // i rachunek gospodarstwa domowego, którego nie eksportujemy.
  owner_name: '',
  household_iban: '',
  household_label: '',
  // Stały przelew do gospodarstwa. Pusty = wylicz z historii; wpisana kwota
  // obowiązuje sztywno, bo to zobowiązanie, a nie wypadkowa wydatków.
  household_fixed: '',
  household_adhoc_fixed: '',
  // Cykliczne przypomnienia: dzień miesiąca (0 = wyłączone) i godzina lokalna.
  reminder_payout_day: '5',      // faktura zwykle wpływa 3.–7.
  reminder_review_day: '25',     // przegląd przed kwartalnym VAT-em
  reminder_hour: '9',
  // Udział VAT naliczonego odliczanego od należnego (0–0.5). Domyślnie 0:
  // przy odkładaniu bezpieczniej odłożyć pełne 23% i mieć nadwyżkę,
  // niż nie dopłacić do urzędu.
  vat_input_share: '0',
}

export async function getSettings(s: Store): Promise<Record<string, string>> {
  const rows = await s.all<{ key: string; value: string }>(
    'SELECT key, value FROM budzet_settings WHERE user_id = ?', s.userId)
  const out = { ...DEFAULT_SETTINGS }
  for (const r of rows) out[r.key] = r.value
  return out
}

export async function setSetting(s: Store, key: string, value: string) {
  await s.run(
    `INSERT INTO budzet_settings(user_id, key, value) VALUES(?,?,?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    s.userId, key, String(value))
}

export const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
