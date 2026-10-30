-- Migration 017: Emergency Card Expiration and Legacy Privacy Hardening
-- Adds expires_at column to emergency_cards and ensures legacy auto-created cards are private.

ALTER TABLE `emergency_cards` ADD COLUMN `expires_at` DATETIME NULL;

-- Make existing cards private if they have no explicit expiration set (legacy auto-public rows)
UPDATE `emergency_cards`
SET `is_public` = FALSE
WHERE `is_public` = TRUE AND `expires_at` IS NULL;
