-- Migration 015: Change emergency_cards.is_public default from TRUE to FALSE
-- Rationale: Emergency cards should be private by default to protect user medical privacy.
-- Users must explicitly opt-in to public sharing.
-- This migration is safe: it only changes the DEFAULT for new rows, not existing data.

ALTER TABLE `emergency_cards`
    ALTER COLUMN `is_public` SET DEFAULT FALSE;

-- NOTE: Existing cards that were auto-created with is_public=TRUE are intentionally
-- left unchanged. Users who previously enabled sharing keep their setting.
-- A separate admin script can be run to audit and notify users if desired.
