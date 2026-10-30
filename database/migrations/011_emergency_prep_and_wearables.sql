-- Migration 011: Emergency Prep & Wearables Sync
-- Groups 8 and 9

-- 1. Extend doctor_appointments with post-visit notes and follow-up date
ALTER TABLE `doctor_appointments`
    ADD COLUMN `doctor_notes` TEXT NULL AFTER `questions_to_ask`,
    ADD COLUMN `followup_date` DATE NULL AFTER `doctor_notes`;

-- 2. Add source tracking to exercise_logs for wearable ingestion
ALTER TABLE `exercise_logs`
    ADD COLUMN `source` VARCHAR(50) NOT NULL DEFAULT 'manual' AFTER `distance_km`;

-- 3. Add source tracking to sleep_logs for wearable ingestion
ALTER TABLE `sleep_logs`
    ADD COLUMN `source` VARCHAR(50) NOT NULL DEFAULT 'manual' AFTER `sleep_quality`;
