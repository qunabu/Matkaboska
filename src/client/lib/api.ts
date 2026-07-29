import type {
  Recipe, RecipeWithNotes, MealPlanEntry, MealPlanEntryFull, FoodLogEntry, DailySummary,
  WaterLog, SupplementWithStatus, SupplementLog, ShoppingList, ShoppingItem,
  Reminder, AppSettings, ApiList, ApiOk,
} from '../../shared/types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export const recipesApi = {
  list: (params?: { search?: string; category?: string; tag?: string; seafood?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.category) q.set('category', params.category)
    if (params?.tag) q.set('tag', params.tag)
    if (params?.seafood) q.set('seafood', '1')
    return req<ApiList<Recipe>>(`/recipes${q.size ? '?' + q : ''}`)
  },
  get: (id: number) => req<RecipeWithNotes>(`/recipes/${id}`),
  create: (data: Partial<Recipe>) => req<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Recipe>) => req<Recipe>(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/recipes/${id}`, { method: 'DELETE' }),
  addNote: (id: number, body: string) => req(`/recipes/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteNote: (id: number, noteId: number) => req<ApiOk>(`/recipes/${id}/notes/${noteId}`, { method: 'DELETE' }),
  recalcMacros: (id: number) => req<Recipe>(`/recipes/${id}/recalc-macros`, { method: 'POST' }),
}

// ── Meal plan ─────────────────────────────────────────────────────────────────

export const planApi = {
  list: (from: string, to: string) => req<ApiList<MealPlanEntry>>(`/plan?from=${from}&to=${to}`),
  listFull: (from: string, to: string) => req<ApiList<MealPlanEntryFull>>(`/plan/print?from=${from}&to=${to}`),
  set: (date: string, meal_type: string, data: { recipe_id: number | null; servings?: number }) =>
    req<MealPlanEntry>(`/plan/${date}/${meal_type}`, { method: 'PUT', body: JSON.stringify(data) }),
  setStatus: (id: number, status: string) =>
    req<MealPlanEntry>(`/plan/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  delete: (date: string, meal_type: string) => req<ApiOk>(`/plan/${date}/${meal_type}`, { method: 'DELETE' }),
}

// ── Food log ──────────────────────────────────────────────────────────────────

export const foodLogApi = {
  list: (date: string) => req<ApiList<FoodLogEntry>>(`/food-log?date=${date}`),
  summary: (date: string) => req<DailySummary>(`/food-log/summary?date=${date}`),
  add: (data: Partial<FoodLogEntry> & { servings?: number }) =>
    req<FoodLogEntry>('/food-log', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/food-log/${id}`, { method: 'DELETE' }),
}

// ── Water log ─────────────────────────────────────────────────────────────────

export const waterApi = {
  get: (date: string) => req<WaterLog>(`/water?date=${date}`),
  update: (date: string, data: { glasses?: number; delta?: number; target_glasses?: number }) =>
    req<WaterLog>(`/water/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
}

// ── Supplements ───────────────────────────────────────────────────────────────

export const supplementsApi = {
  list: (date?: string) => req<ApiList<SupplementWithStatus>>(`/supplements${date ? '?date=' + date : ''}`),
  get: (id: number) => req<SupplementWithStatus>(`/supplements/${id}`),
  create: (data: object) => req<SupplementWithStatus>('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: object) => req<SupplementWithStatus>(`/supplements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/supplements/${id}`, { method: 'DELETE' }),
  log: (id: number) => req(`/supplements/${id}/log`, { method: 'POST' }),
  deleteLog: (logId: number) => req<ApiOk>(`/supplements/log/${logId}`, { method: 'DELETE' }),
  getLogs: (date: string) => req<ApiList<SupplementLog>>(`/supplements/log?date=${date}`),
}

// ── Shopping ──────────────────────────────────────────────────────────────────

export const shoppingApi = {
  lists: () => req<ApiList<ShoppingList>>('/shopping-lists'),
  getList: (id: number) => req<ShoppingList & { items: ShoppingItem[] }>(`/shopping-lists/${id}`),
  createList: (name: string) => req<ShoppingList>('/shopping-lists', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteList: (id: number) => req<ApiOk>(`/shopping-lists/${id}`, { method: 'DELETE' }),
  generateList: (from: string, to: string, name?: string) =>
    req<ShoppingList & { items: ShoppingItem[] }>('/shopping-lists/generate', { method: 'POST', body: JSON.stringify({ from, to, name }) }),
  addItem: (data: object) => req<ShoppingItem>('/shopping-lists/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: number, data: object) => req<ShoppingItem>(`/shopping-lists/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteItem: (id: number) => req<ApiOk>(`/shopping-lists/items/${id}`, { method: 'DELETE' }),
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export const remindersApi = {
  list: () => req<ApiList<Reminder>>('/push/reminders'),
  create: (data: object) => req<Reminder>('/push/reminders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: object) => req<Reminder>(`/push/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/push/reminders/${id}`, { method: 'DELETE' }),
}

// ── Push ──────────────────────────────────────────────────────────────────────

export const pushApi = {
  subscribe: (sub: PushSubscriptionJSON) =>
    req<ApiOk>('/push/subscribe', { method: 'POST', body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.keys,
      userAgent: navigator.userAgent,
    }) }),
  unsubscribe: (endpoint: string) => req<ApiOk>('/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  test: () => req('/push/test', { method: 'POST' }),
}

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  get: () => req<AppSettings>('/settings'),
  update: (data: Partial<AppSettings>) => req<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(dateStr))
}

export function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekDates(startDate: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
}

export function getWeekStart(dateStr: string) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}
