CREATE TABLE IF NOT EXISTS `mybites_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
