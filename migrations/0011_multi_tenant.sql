-- Multi-tenant: add user_id to all data tables and migrate existing data
-- to the owner account (qunabu.com@gmail.com).

ALTER TABLE recipes ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE meal_plan_entries ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE food_log ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE water_log ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE supplements ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE shopping_lists ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE shopping_lists ADD COLUMN share_token TEXT;
ALTER TABLE reminders ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE todos ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ideas ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE chores ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE habits ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE pantry_items ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE voice_notes ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE push_subscriptions ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

--> statement-breakpoint
-- Migrate existing data to owner account
UPDATE recipes SET user_id = 'qunabu.com@gmail.com';
UPDATE meal_plan_entries SET user_id = 'qunabu.com@gmail.com';
UPDATE food_log SET user_id = 'qunabu.com@gmail.com';
UPDATE water_log SET user_id = 'qunabu.com@gmail.com';
UPDATE supplements SET user_id = 'qunabu.com@gmail.com';
UPDATE shopping_lists SET user_id = 'qunabu.com@gmail.com';
UPDATE reminders SET user_id = 'qunabu.com@gmail.com';
UPDATE todos SET user_id = 'qunabu.com@gmail.com';
UPDATE ideas SET user_id = 'qunabu.com@gmail.com';
UPDATE chores SET user_id = 'qunabu.com@gmail.com';
UPDATE habits SET user_id = 'qunabu.com@gmail.com';
UPDATE pantry_items SET user_id = 'qunabu.com@gmail.com';
UPDATE voice_notes SET user_id = 'qunabu.com@gmail.com';
UPDATE push_subscriptions SET user_id = 'qunabu.com@gmail.com';
UPDATE products SET user_id = 'qunabu.com@gmail.com';

--> statement-breakpoint
-- Recreate settings table with composite primary key (user_id, key)
CREATE TABLE settings_new (
  user_id TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
INSERT INTO settings_new SELECT 'qunabu.com@gmail.com', key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

--> statement-breakpoint
-- Fix unique constraints to be user-scoped
DROP INDEX IF EXISTS water_log_date_unique;
CREATE UNIQUE INDEX water_log_user_date_uidx ON water_log(user_id, date);

DROP INDEX IF EXISTS pantry_items_name_unique;
CREATE UNIQUE INDEX pantry_items_user_name_uidx ON pantry_items(user_id, name);

DROP INDEX IF EXISTS products_name_unique;
CREATE UNIQUE INDEX products_user_name_uidx ON products(user_id, name);

DROP INDEX IF EXISTS recipes_slug_unique;
CREATE UNIQUE INDEX recipes_user_slug_uidx ON recipes(user_id, slug);

DROP INDEX IF EXISTS push_subscriptions_endpoint_unique;
CREATE UNIQUE INDEX push_sub_user_endpoint_uidx ON push_subscriptions(user_id, endpoint);

CREATE UNIQUE INDEX shopping_lists_share_token_uidx ON shopping_lists(share_token)
  WHERE share_token IS NOT NULL;

--> statement-breakpoint
-- Performance indexes
CREATE INDEX recipes_user_idx ON recipes(user_id);
CREATE INDEX meal_plan_entries_user_idx ON meal_plan_entries(user_id);
CREATE INDEX food_log_user_idx ON food_log(user_id);
CREATE INDEX water_log_user_idx ON water_log(user_id);
CREATE INDEX supplements_user_idx ON supplements(user_id);
CREATE INDEX shopping_lists_user_idx ON shopping_lists(user_id);
CREATE INDEX reminders_user_idx ON reminders(user_id);
CREATE INDEX todos_user_idx ON todos(user_id);
CREATE INDEX ideas_user_idx ON ideas(user_id);
CREATE INDEX chores_user_idx ON chores(user_id);
CREATE INDEX habits_user_idx ON habits(user_id);
CREATE INDEX pantry_items_user_idx ON pantry_items(user_id);
CREATE INDEX voice_notes_user_idx ON voice_notes(user_id);
CREATE INDEX push_sub_user_idx ON push_subscriptions(user_id);
CREATE INDEX products_user_idx ON products(user_id);
