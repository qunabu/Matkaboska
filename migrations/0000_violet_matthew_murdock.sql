CREATE TABLE `food_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logged_at` integer DEFAULT (unixepoch()) NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`recipe_id` integer,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`portion` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `food_log_date_idx` ON `food_log` (`date`);--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`meal_type` text NOT NULL,
	`recipe_id` integer,
	`servings` real DEFAULT 1 NOT NULL,
	`batch_group` text,
	`is_leftover` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plan_date_idx` ON `meal_plan_entries` (`date`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `recipe_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`servings` integer DEFAULT 1 NOT NULL,
	`prep_minutes` integer,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`is_seafood` integer DEFAULT false NOT NULL,
	`source` text,
	`macros` text,
	`macros_confidence` text,
	`macros_assumptions` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_slug_unique` ON `recipes` (`slug`);--> statement-breakpoint
CREATE INDEX `recipe_category_idx` ON `recipes` (`category`);--> statement-breakpoint
CREATE INDEX `recipe_slug_idx` ON `recipes` (`slug`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`time` text NOT NULL,
	`days` text DEFAULT '[0,1,2,3,4,5,6]' NOT NULL,
	`linked_id` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fired_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`category` text DEFAULT 'other' NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_items_list_idx` ON `shopping_items` (`list_id`);--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'manual' NOT NULL,
	`date_range_start` text,
	`date_range_end` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplement_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplement_id` integer NOT NULL,
	`taken_at` integer DEFAULT (unixepoch()) NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suplog_date_idx` ON `supplement_log` (`date`);--> statement-breakpoint
CREATE TABLE `supplements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`dose` text,
	`schedule` text DEFAULT '{"times":[],"days":[0,1,2,3,4,5,6]}' NOT NULL,
	`notes` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `water_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`glasses` integer DEFAULT 0 NOT NULL,
	`target_glasses` integer DEFAULT 8 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `water_log_date_unique` ON `water_log` (`date`);