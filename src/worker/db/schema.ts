import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const unixNow = sql`(unixepoch())`

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
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
  recipe_user_slug_uidx: uniqueIndex('recipes_user_slug_uidx').on(t.user_id, t.slug),
  recipe_category_idx: index('recipe_category_idx').on(t.category),
  recipe_slug_idx: index('recipe_slug_idx').on(t.slug),
  recipe_user_idx: index('recipes_user_idx').on(t.user_id),
}))

export const recipe_notes = sqliteTable('recipe_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipe_id: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  created_at: integer('created_at').notNull().default(unixNow),
})

export const meal_plan_entries = sqliteTable('meal_plan_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  date: text('date').notNull(),
  meal_type: text('meal_type').notNull(),
  recipe_id: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  product_id: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  grams: real('grams'),
  servings: real('servings').notNull().default(1),
  batch_group: text('batch_group'),
  is_leftover: integer('is_leftover', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('planned'),
}, (t) => ({
  plan_date_idx: index('plan_date_idx').on(t.date),
  plan_user_idx: index('meal_plan_entries_user_idx').on(t.user_id),
}))

export const food_log = sqliteTable('food_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
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
  food_log_user_idx: index('food_log_user_idx').on(t.user_id),
}))

export const water_log = sqliteTable('water_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  date: text('date').notNull(),
  glasses: integer('glasses').notNull().default(0),
  target_glasses: integer('target_glasses').notNull().default(8),
}, (t) => ({
  water_user_date_uidx: uniqueIndex('water_log_user_date_uidx').on(t.user_id, t.date),
  water_user_idx: index('water_log_user_idx').on(t.user_id),
}))

export const supplements = sqliteTable('supplements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  dose: text('dose'),
  schedule: text('schedule').notNull().default('{"times":[],"days":[0,1,2,3,4,5,6]}'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  last_notified_at: integer('last_notified_at'),
}, (t) => ({
  supplements_user_idx: index('supplements_user_idx').on(t.user_id),
}))

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
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  type: text('type').notNull().default('manual'),
  date_range_start: text('date_range_start'),
  date_range_end: text('date_range_end'),
  share_token: text('share_token'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  shopping_lists_user_idx: index('shopping_lists_user_idx').on(t.user_id),
  shopping_lists_share_token_uidx: uniqueIndex('shopping_lists_share_token_uidx').on(t.share_token),
}))

export const shopping_items = sqliteTable('shopping_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  list_id: integer('list_id').notNull().references(() => shopping_lists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  category: text('category').notNull().default('other'),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  in_frisco: integer('in_frisco', { mode: 'boolean' }).notNull().default(false),
  frisco_product_id: text('frisco_product_id'),
  source: text('source').notNull().default('manual'),
  sort_order: integer('sort_order').notNull().default(0),
}, (t) => ({
  shopping_items_list_idx: index('shopping_items_list_idx').on(t.list_id),
}))

export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  type: text('type').notNull(),
  label: text('label').notNull(),
  time: text('time').notNull(),
  days: text('days').notNull().default('[0,1,2,3,4,5,6]'),
  linked_id: integer('linked_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  last_fired_at: integer('last_fired_at'),
}, (t) => ({
  reminders_user_idx: index('reminders_user_idx').on(t.user_id),
}))

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  title: text('title').notNull(),
  priority: text('priority').notNull().default('medium'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  todos_user_idx: index('todos_user_idx').on(t.user_id),
}))

export const ideas = sqliteTable('ideas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  title: text('title').notNull(),
  description: text('description'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  ideas_user_idx: index('ideas_user_idx').on(t.user_id),
}))

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  user_id: text('user_id').notNull(),                         // email
  expires_at: integer('expires_at').notNull(),
})

export const chores = sqliteTable('chores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  interval_days: integer('interval_days'),
  weekdays: text('weekdays'),
  time: text('time').notNull().default('20:00'),
  nag_minutes: integer('nag_minutes').notNull().default(60),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  last_done_at: integer('last_done_at'),
  last_notified_at: integer('last_notified_at'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  chores_user_idx: index('chores_user_idx').on(t.user_id),
}))

export const habits = sqliteTable('habits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  window_start: integer('window_start').notNull().default(540),
  window_end: integer('window_end').notNull().default(1260),
  prompt_date: text('prompt_date'),
  prompt_minute: integer('prompt_minute'),
  prompted: integer('prompted', { mode: 'boolean' }).notNull().default(false),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  habits_user_idx: index('habits_user_idx').on(t.user_id),
}))

export const habit_checkins = sqliteTable('habit_checkins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  habit_id: integer('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
}, (t) => ({
  habit_checkin_uidx: uniqueIndex('habit_checkin_uidx').on(t.habit_id, t.date),
}))

export const pantry_items = sqliteTable('pantry_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  pantry_user_name_uidx: uniqueIndex('pantry_items_user_name_uidx').on(t.user_id, t.name),
  pantry_user_idx: index('pantry_items_user_idx').on(t.user_id),
}))

export const voice_notes = sqliteTable('voice_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  audio_key: text('audio_key').notNull(),
  mime: text('mime').notNull().default('audio/webm'),
  duration_sec: integer('duration_sec'),
  transcript: text('transcript'),
  transcript_source: text('transcript_source'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  voice_notes_user_idx: index('voice_notes_user_idx').on(t.user_id),
}))

export const push_subscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  user_agent: text('user_agent'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  push_sub_user_endpoint_uidx: uniqueIndex('push_sub_user_endpoint_uidx').on(t.user_id, t.endpoint),
  push_sub_user_idx: index('push_sub_user_idx').on(t.user_id),
}))

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  title: text('title').notNull(),
  body: text('body').notNull(),
  url: text('url'),
  read_at: integer('read_at'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  notifications_user_idx: index('notifications_user_idx').on(t.user_id),
}))

export const settings = sqliteTable('settings', {
  user_id: text('user_id').notNull().default(''),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, (t) => ({
  settings_pk: primaryKey({ columns: [t.user_id, t.key] }),
}))

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().default(''),
  name: text('name').notNull(),
  kcal: real('kcal'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g'),
  iron_mg: real('iron_mg'),
  portion: text('portion'),
  serving_g: real('serving_g'),
  package_g: real('package_g'),
  frisco_product_id: text('frisco_product_id'),
  created_at: integer('created_at').notNull().default(unixNow),
}, (t) => ({
  products_user_name_uidx: uniqueIndex('products_user_name_uidx').on(t.user_id, t.name),
  product_name_idx: index('product_name_idx').on(t.name),
  products_user_idx: index('products_user_idx').on(t.user_id),
}))
