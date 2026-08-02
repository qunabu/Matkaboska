import type {
  Recipe, RecipeWithNotes, MealPlanEntry, MealPlanEntryFull, FoodLogEntry, DailySummary,
  WaterLog, SupplementWithStatus, SupplementLog, ShoppingList, ShoppingItem,
  Reminder, AppSettings, ApiList, ApiOk, Product, Todo, Idea, VoiceNote, PantryItem, Habit, Chore,
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
  bulkImport: (items: Partial<Recipe>[]) =>
    req<{ imported: number; recipes: Recipe[] }>('/recipes/import', { method: 'POST', body: JSON.stringify({ recipes: items }) }),
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
  deleteEntry: (id: number) => req<ApiOk>(`/plan/entry/${id}`, { method: 'DELETE' }),
  append: (date: string, meal_type: string, recipe_id: number, servings = 1) =>
    req<{ inserted: number }>(`/plan/import`, { method: 'POST', body: JSON.stringify({ entries: [{ date, meal_type, recipe_id, servings }], replace: false }) }),
  appendProduct: (date: string, meal_type: string, product_id: number, grams: number) =>
    req<{ inserted: number }>(`/plan/import`, { method: 'POST', body: JSON.stringify({ entries: [{ date, meal_type, product_id, grams, servings: 1 }], replace: false }) }),
  generateWeek: (weekStart: string) =>
    req<{ inserted: number }>(`/plan/generate-week`, { method: 'POST', body: JSON.stringify({ weekStart }) }),
}

// ── Food log ──────────────────────────────────────────────────────────────────

export const foodLogApi = {
  list: (date: string) => req<ApiList<FoodLogEntry>>(`/food-log?date=${date}`),
  summary: (date: string) => req<DailySummary>(`/food-log/summary?date=${date}`),
  add: (data: Partial<FoodLogEntry> & { servings?: number }) =>
    req<FoodLogEntry>('/food-log', { method: 'POST', body: JSON.stringify(data) }),
  estimate: (data: { description: string; date?: string; portion?: string }) =>
    req<FoodLogEntry>('/food-log/estimate', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/food-log/${id}`, { method: 'DELETE' }),
}

// ── Products (reusable ready-made products with macros) ────────────────────────

export const productsApi = {
  list: (search?: string) => req<ApiList<Product>>(`/products${search ? '?search=' + encodeURIComponent(search) : ''}`),
  create: (data: Partial<Product>) => req<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Product>) => req<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/products/${id}`, { method: 'DELETE' }),
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
  remindNow: (id: number) => req<{ sent: number; total: number; errors: string[] }>(`/supplements/${id}/remind-now`, { method: 'POST' }),
  deleteLog: (logId: number) => req<ApiOk>(`/supplements/log/${logId}`, { method: 'DELETE' }),
  getLogs: (date: string) => req<ApiList<SupplementLog>>(`/supplements/log?date=${date}`),
}

// ── Shopping ──────────────────────────────────────────────────────────────────

export const shoppingApi = {
  lists: () => req<ApiList<ShoppingList>>('/shopping-lists'),
  getList: (id: number) => req<ShoppingList & { items: ShoppingItem[] }>(`/shopping-lists/${id}`),
  createList: (name: string) => req<ShoppingList>('/shopping-lists', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteList: (id: number) => req<ApiOk>(`/shopping-lists/${id}`, { method: 'DELETE' }),
  // Read-only aggregated shopping list for a date range (no DB write) — used by
  // the printable checklist.
  shoppingPreview: (from: string, to: string) =>
    req<ApiList<{ name: string; quantity: number | null; unit: string | null }>>(`/shopping-lists/preview?from=${from}&to=${to}`),
  generateList: (from: string, to: string, name?: string) =>
    req<ShoppingList & { items: ShoppingItem[] }>('/shopping-lists/generate', { method: 'POST', body: JSON.stringify({ from, to, name }) }),
  addItem: (data: object) => req<ShoppingItem>('/shopping-lists/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: number, data: object) => req<ShoppingItem>(`/shopping-lists/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteItem: (id: number) => req<ApiOk>(`/shopping-lists/items/${id}`, { method: 'DELETE' }),
  // "Mam w domu": move item to pantry, drop from Frisco cart, remove from list.
  haveAtHome: (itemId: number) =>
    req<{ ok: boolean; pantry: string; removedFromCart: boolean }>(`/shopping-lists/items/${itemId}/have-at-home`, { method: 'POST', body: '{}' }),
  shareList: (id: number) => req<{ share_token: string }>(`/shopping-lists/${id}/share`, { method: 'POST' }),
  revokeShare: (id: number) => req<ApiOk>(`/shopping-lists/${id}/share`, { method: 'DELETE' }),
  getShared: (token: string) => req<ShoppingList & { items: ShoppingItem[] }>(`/s/${token}`),
  addSharedItem: (token: string, data: { name: string; quantity?: number | null; unit?: string | null; category?: string }) =>
    req<ShoppingItem>(`/s/${token}/items`, { method: 'POST', body: JSON.stringify(data) }),
  // Fill the Frisco cart. The server processes the list in chunks (to stay
  // under the Workers subrequest cap), so we loop until `done`, merging results.
  // Add/remove a single item in the Frisco cart (drives the per-item checkbox).
  friscoSetItem: (itemId: number, inCart: boolean) =>
    req<{ inCart: boolean; notFound?: boolean; productId?: string }>('/frisco/item', {
      method: 'POST', body: JSON.stringify({ itemId, inCart }),
    }),
  friscoOrder: async (listId: number): Promise<FriscoOrderResult> => {
    const merged: FriscoOrderResult = {
      listName: '', total: 0, inCart: 0, added: [], notFound: [], skipped: [], removedUnavailable: [],
    }
    let offset: number | null = 0
    do {
      const r: FriscoChunk = await req('/frisco/order', {
        method: 'POST', body: JSON.stringify({ listId, offset }),
      })
      merged.listName = r.listName
      merged.total = r.total
      merged.added.push(...r.added)
      merged.notFound.push(...r.notFound)
      merged.skipped.push(...(r.skipped ?? []))
      if (r.done) {
        merged.inCart = r.inCart ?? merged.added.length
        merged.removedUnavailable = r.removedUnavailable
      }
      offset = r.nextOffset
    } while (offset != null)
    return merged
  },
}

interface FriscoChunk {
  listName: string
  total: number
  nextOffset: number | null
  done: boolean
  added: { item: string; product?: string }[]
  notFound: string[]
  skipped?: string[]
  removedUnavailable: string[]
  inCart?: number
}

export interface FriscoOrderResult {
  listName: string
  total: number
  inCart: number
  added: { item: string; product?: string }[]
  notFound: string[]
  skipped: string[]
  removedUnavailable: string[]
}

// ── Todos ─────────────────────────────────────────────────────────────────────

export const todosApi = {
  list: () => req<ApiList<Todo>>('/todos'),
  create: (data: { title: string; priority?: Todo['priority'] }) =>
    req<Todo>('/todos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Pick<Todo, 'title' | 'priority' | 'done' | 'sort_order'>>) =>
    req<Todo>(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/todos/${id}`, { method: 'DELETE' }),
}

// ── Ideas ─────────────────────────────────────────────────────────────────────

export const ideasApi = {
  list: () => req<ApiList<Idea>>('/ideas'),
  create: (data: { title: string; description?: string | null }) =>
    req<Idea>('/ideas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Pick<Idea, 'title' | 'description' | 'done' | 'sort_order'>>) =>
    req<Idea>(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/ideas/${id}`, { method: 'DELETE' }),
}

// ── Habits ────────────────────────────────────────────────────────────────────

export const habitsApi = {
  list: () => req<ApiList<Habit>>('/habits'),
  create: (name: string) => req<Habit>('/habits', { method: 'POST', body: JSON.stringify({ name }) }),
  checkin: (id: number, success: boolean) =>
    req<{ ok: boolean; streak: number; today: 'yes' | 'no' | null }>(`/habits/${id}/checkin`, { method: 'POST', body: JSON.stringify({ success }) }),
  update: (id: number, data: { name?: string; active?: boolean }) =>
    req<{ id: number }>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => req<ApiOk>(`/habits/${id}`, { method: 'DELETE' }),
}

// ── Chores (recurring tasks) ────────────────────────────────────────────────

type ChoreInput = { name?: string; interval_days?: number | null; weekdays?: number[] | null; time?: string; nag_minutes?: number; active?: boolean }

export const choresApi = {
  list: () => req<ApiList<Chore>>('/chores'),
  create: (data: ChoreInput) => req<Chore>('/chores', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: ChoreInput) => req<Chore>(`/chores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  done: (id: number) => req<Chore>(`/chores/${id}/done`, { method: 'POST' }),
  remindNow: (id: number) => req<{ sent: number; total: number; errors: string[] }>(`/chores/${id}/remind-now`, { method: 'POST' }),
  delete: (id: number) => req<ApiOk>(`/chores/${id}`, { method: 'DELETE' }),
}

// ── Pantry ────────────────────────────────────────────────────────────────────

export const pantryApi = {
  list: () => req<ApiList<PantryItem>>('/pantry'),
  create: (name: string) => req<PantryItem>('/pantry', { method: 'POST', body: JSON.stringify({ name }) }),
  delete: (id: number) => req<ApiOk>(`/pantry/${id}`, { method: 'DELETE' }),
}

// ── Voice notes ─────────────────────────────────────────────────────────────

export const voiceNotesApi = {
  list: () => req<ApiList<VoiceNote>>('/voice-notes'),
  create: async (audio: Blob, opts: { transcript?: string; duration?: number; mime?: string }) => {
    const fd = new FormData()
    fd.append('audio', audio, 'note.webm')
    if (opts.transcript) fd.append('transcript', opts.transcript)
    if (opts.duration != null) fd.append('duration', String(opts.duration))
    if (opts.mime) fd.append('mime', opts.mime)
    const res = await fetch('/api/voice-notes', { method: 'POST', body: fd })
    if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
    return res.json() as Promise<VoiceNote>
  },
  update: (id: number, data: { transcript?: string | null; transcript_source?: VoiceNote['transcript_source'] }) =>
    req<VoiceNote>(`/voice-notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  transcribe: (id: number) => req<VoiceNote>(`/voice-notes/${id}/transcribe`, { method: 'POST', body: '{}' }),
  delete: (id: number) => req<ApiOk>(`/voice-notes/${id}`, { method: 'DELETE' }),
  audioUrl: (id: number) => `/api/voice-notes/${id}/audio`,
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

// ── Auth (CF Access / Google) ────────────────────────────────────────────────

export const authApi = {
  me: () => req<{ authed: boolean; email: string }>('/auth/me'),
  logout: () => req<ApiOk>('/auth/logout', { method: 'POST' }),
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface IntegrationsConfig {
  frisco: { username: string; warehouse: string; hasPassword: boolean; hasRefreshToken: boolean }
  anthropic: { hasKey: boolean }
}
export interface IntegrationsUpdate {
  frisco?: { username?: string; password?: string; warehouse?: string }
  anthropic_api_key?: string
}

export const settingsApi = {
  get: () => req<AppSettings>('/settings'),
  update: (data: Partial<AppSettings>) => req<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  integrations: () => req<IntegrationsConfig>('/settings/integrations'),
  updateIntegrations: (data: IntegrationsUpdate) =>
    req<{ ok: boolean }>('/settings/integrations', { method: 'PUT', body: JSON.stringify(data) }),
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export const onboardingApi = {
  status: () => req<{ needsOnboarding: boolean }>('/onboarding/status'),
  generate: (data: { dishes: string[]; kcal_target: number; protein_g_target: number }) =>
    req<{ imported: number }>('/onboarding/generate', { method: 'POST', body: JSON.stringify(data) }),
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
