CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`audio_key` text NOT NULL,
	`mime` text DEFAULT 'audio/webm' NOT NULL,
	`duration_sec` integer,
	`transcript` text,
	`transcript_source` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
