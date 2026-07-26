import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const unixNow = sql`(unixepoch())`

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').notNull(),
  servings: integer('servings').notNull().default(1),
  prep_minutes: integer('prep_minutes'),
  ingredients: text('ingredients').notNull().default('[]'),
  steps: text('steps').notNull().default('[]'),
  tags: text('tags').notNull().default('[]'),
  is_seafood: integer('is_seafood', { mode: 'boolean' }).notNull().default(false),
  source: text('source'),
  macros: text('macros'),
  macros_confidence: text('macros_confidence'),
  macros_assumptions: text('macros_assumptions'),
  created_at: integer('created_at').notNull().default(unixNow),
  updated_at: integer('updated_at').notNull().default(unixNow),
}, (t) => ({
  recipe_category_idx: index('recipe_category_idx').on(t.category),
  recipe_slug_idx: index('recipe_slug_idx').on(t.slug),
}))

export const recipe_notes = sqliteTable('recipe_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipe_id: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  created_at: integer('created_at').notNull().default(unixNow),
})

export const meal_plan_entries = sqliteTable('meal_plan_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  meal_type: text('meal_type').notNull(),
  recipe_id: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  servings: real('servings').notNull().default(1),
  batch_group: text('batch_group'),
  is_leftover: integer('is_leftover', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('planned'),
}, (t) => ({
  plan_date_idx: index('plan_date_idx').on(t.date),
}))

export const food_log = sqliteTable('food_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  logged_at: integer('logged_at').notNull().default(unixNow),
  date: text('date').notNull(),
  description: text('description'),
  recipe_id: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  kcal: real('kcal'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g'),
  portion: text('portion'),
}, (t) => ({
  food_log_date_idx: index('food_log_date_idx').on(t.date),
}))

export const water_log = sqliteTable('water_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  glasses: integer('glasses').notNull().default(0),
  target_glasses: integer('target_glasses').notNull().default(8),
})

export const supplements = sqliteTable('supplements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),                               // supplement|medication
  dose: text('dose'),
  schedule: text('schedule').notNull().default('{"times":[],"days":[0,1,2,3,4,5,6]}'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const supplement_log = sqliteTable('supplement_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplement_id: integer('supplement_id').notNull().references(() => supplements.id, { onDelete: 'cascade' }),
  taken_at: integer('taken_at').notNull().default(unixNow),
  date: text('date').notNull(),
}, (t) => ({
  suplog_date_idx: index('suplog_date_idx').on(t.date),
}))

export const shopping_lists = sqliteTable('shopping_lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull().default('manual'),             // generated|manual
  date_range_start: text('date_range_start'),
  date_range_end: text('date_range_end'),
  created_at: integer('created_at').notNull().default(unixNow),
})

export const shopping_items = sqliteTable('shopping_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  list_id: integer('list_id').notNull().references(() => shopping_lists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  category: text('category').notNull().default('other'),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  source: text('source').notNull().default('manual'),
  sort_order: integer('sort_order').notNull().default(0),
}, (t) => ({
  shopping_items_list_idx: index('shopping_items_list_idx').on(t.list_id),
}))

export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),                               // supplement|cook|prep|water|custom
  label: text('label').notNull(),
  time: text('time').notNull(),                               // HH:MM
  days: text('days').notNull().default('[0,1,2,3,4,5,6]'),   // JSON
  linked_id: integer('linked_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  last_fired_at: integer('last_fired_at'),
})

export const push_subscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  user_agent: text('user_agent'),
  created_at: integer('created_at').notNull().default(unixNow),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),                             // JSON
})
