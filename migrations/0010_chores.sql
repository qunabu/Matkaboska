CREATE TABLE `chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`interval_days` integer,
	`weekdays` text,
	`time` text DEFAULT '20:00' NOT NULL,
	`nag_minutes` integer DEFAULT 60 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_done_at` integer,
	`last_notified_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
