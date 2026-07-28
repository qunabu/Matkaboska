export type Category = 'breakfast' | 'main' | 'snack' | 'classic'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type PlanStatus = 'planned' | 'eaten' | 'skipped'
export type SupKind = 'supplement' | 'medication'
export type ShopCategory = 'produce' | 'dairy' | 'pantry' | 'frozen' | 'other'
export type MacroConfidence = 'low' | 'medium' | 'high'

export interface Ingredient {
  name: string
  amount: string
  unit: string
}

export interface Macros {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export interface SupSchedule {
  times: string[]   // HH:MM
  days: number[]    // 0=Sun … 6=Sat
}

export interface Recipe {
  id: number
  title: string
  slug: string
  category: Category
  servings: number
  prep_minutes: number | null
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  is_seafood: boolean
  source: string | null
  macros: Macros | null
  macros_confidence: MacroConfidence | null
  macros_assumptions: string | null
  created_at: number
  updated_at: number
}

export interface Product {
  id: number
  name: string
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  portion: string | null
  created_at: number
}

export interface RecipeNote {
  id: number
  recipe_id: number
  body: string
  created_at: number
}

export interface RecipeWithNotes extends Recipe {
  notes: RecipeNote[]
}

export interface MealPlanEntry {
  id: number
  date: string
  meal_type: MealType
  recipe_id: number | null
  recipe?: Pick<Recipe, 'id' | 'title' | 'slug' | 'macros' | 'prep_minutes'>
  servings: number
  batch_group: string | null
  is_leftover: boolean
  status: PlanStatus
}

export interface FoodLogEntry {
  id: number
  logged_at: number
  date: string
  description: string | null
  recipe_id: number | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  portion: string | null
}

export interface DailySummary {
  date: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  entries: number
}

export interface WaterLog {
  id: number
  date: string
  glasses: number
  target_glasses: number
}

export interface Supplement {
  id: number
  name: string
  kind: SupKind
  dose: string | null
  schedule: SupSchedule
  notes: string | null
  active: boolean
}

export interface SupplementLog {
  id: number
  supplement_id: number
  taken_at: number
  date: string
}

export interface SupplementWithStatus extends Supplement {
  taken_today: number
  doses_due: number
}

export interface ShoppingList {
  id: number
  name: string
  type: 'generated' | 'manual'
  date_range_start: string | null
  date_range_end: string | null
  created_at: number
  item_count?: number
  checked_count?: number
}

export interface ShoppingItem {
  id: number
  list_id: number
  name: string
  quantity: number | null
  unit: string | null
  category: ShopCategory
  checked: boolean
  in_frisco: boolean
  frisco_product_id: string | null
  source: 'generated' | 'manual'
  sort_order: number
}

export interface Reminder {
  id: number
  type: 'supplement' | 'cook' | 'prep' | 'water' | 'custom'
  label: string
  time: string   // HH:MM
  days: number[]
  linked_id: number | null
  enabled: boolean
  last_fired_at: number | null
}

export type TodoPriority = 'high' | 'medium' | 'low'

export interface Todo {
  id: number
  title: string
  priority: TodoPriority
  done: boolean
  sort_order: number
  created_at: number
}

export interface Idea {
  id: number
  title: string
  description: string | null
  done: boolean
  sort_order: number
  created_at: number
}

export interface PantryItem {
  id: number
  name: string
  created_at: number
}

export interface VoiceNote {
  id: number
  audio_key: string
  mime: string
  duration_sec: number | null
  transcript: string | null
  transcript_source: 'speech' | 'manual' | 'whisper' | 'elevenlabs' | null
  created_at: number
}

export interface AppSettings {
  kcal_target: number
  protein_g_target: number
  carbs_g_target: number
  fat_g_target: number
  water_glasses_target: number
  timezone: string
  quiet_hours_start: string | null  // HH:MM
  quiet_hours_end: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  kcal_target: 2300,
  protein_g_target: 150,
  carbs_g_target: 250,
  fat_g_target: 80,
  water_glasses_target: 8,
  timezone: 'Europe/Warsaw',
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
}

export interface ApiList<T> { items: T[]; total: number }
export interface ApiOk { ok: true }
export interface ApiError { error: string }
