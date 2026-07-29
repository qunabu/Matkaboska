CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`window_start` integer DEFAULT 540 NOT NULL,
	`window_end` integer DEFAULT 1260 NOT NULL,
	`prompt_date` text,
	`prompt_minute` integer,
	`prompted` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `habit_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`success` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_checkin_uidx` ON `habit_checkins` (`habit_id`,`date`);
