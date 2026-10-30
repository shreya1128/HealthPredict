-- Migration 018: Add timezone column to users table for timezone-aware reminders
-- Default to 'UTC' for existing users

ALTER TABLE users ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'UTC' AFTER reminder_lead_time_minutes;
