-- Migration 010: Reminders, Alerts, Web Push, and Adherence Streaks
-- Group 7 implementation

-- 1. Expand notification_type enum in notifications table
ALTER TABLE `notifications` 
    MODIFY COLUMN `notification_type` ENUM(
        'MEDICINE_REMINDER', 
        'MISSED_MEDICINE', 
        'WEEKLY_REPORT', 
        'ASSESSMENT_COMPLETED', 
        'GOAL_PROGRESS', 
        'WELLNESS_REMINDER', 
        'ADMIN_MESSAGE',
        'REFILL_ALERT',
        'APPOINTMENT_REMINDER',
        'STREAK_MILESTONE'
    ) NOT NULL;

-- 2. Add sent_at and snoozed_until columns to notifications
ALTER TABLE `notifications`
    ADD COLUMN `sent_at` DATETIME NULL AFTER `read_at`,
    ADD COLUMN `snoozed_until` DATETIME NULL AFTER `sent_at`;

-- 3. Add quiet hours and lead time columns to users
ALTER TABLE `users`
    ADD COLUMN `quiet_hours_start` TIME NULL AFTER `email_verified`,
    ADD COLUMN `quiet_hours_end` TIME NULL AFTER `quiet_hours_start`,
    ADD COLUMN `reminder_lead_time_minutes` INT NOT NULL DEFAULT 15 AFTER `quiet_hours_end`;

-- 4. Extend user_device_tokens for Web Push subscriptions
ALTER TABLE `user_device_tokens`
    ADD COLUMN `p256dh` VARCHAR(255) NULL AFTER `push_token`,
    ADD COLUMN `auth` VARCHAR(255) NULL AFTER `p256dh`;
