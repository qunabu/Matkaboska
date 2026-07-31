ALTER TABLE `meal_plan_entries` ADD `product_id` integer REFERENCES products(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `meal_plan_entries` ADD `grams` real;
