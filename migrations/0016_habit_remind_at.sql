-- Fixed daily reminder time for a habit ("HH:MM", local timezone).
-- NULL keeps the old behaviour: one prompt at a random minute inside the window.
ALTER TABLE `habits` ADD COLUMN `remind_at` text;
