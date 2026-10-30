-- Migration 008: Care Profile Scoping & Caregiver Access
-- Scopes health and tracking resources to care_profiles
-- Drops unique user_id on emergency_cards and unique_user_date on health_history

-- 1. Ensure all users have a primary care profile
INSERT INTO `care_profiles` (`account_owner_id`, `full_name`, `relationship`, `gender`, `is_primary`, `created_at`, `updated_at`)
SELECT u.`id`, COALESCE(u.`full_name`, 'Primary User'), 'SELF', COALESCE(u.`gender`, 'OTHER'), TRUE, NOW(), NOW()
FROM `users` u
LEFT JOIN `care_profiles` cp ON cp.`account_owner_id` = u.`id` AND cp.`is_primary` = TRUE
WHERE cp.`id` IS NULL;

-- 2. Caregiver Access additions
ALTER TABLE `caregiver_access`
    ADD COLUMN `caregiver_user_id` BIGINT NULL,
    ADD CONSTRAINT `fk_caregiver_user` FOREIGN KEY (`caregiver_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    ADD INDEX `idx_caregiver_user_id` (`caregiver_user_id`);

-- 3. Scope medicines
ALTER TABLE `medicines`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_medicines_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_medicines_care_profile` (`care_profile_id`);

-- 4. Scope symptom_logs
ALTER TABLE `symptom_logs`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_symptom_logs_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_symptoms_care_profile` (`care_profile_id`);

-- 5. Scope doctor_appointments
ALTER TABLE `doctor_appointments`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_doctor_appointments_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_doctor_appointments_care_profile` (`care_profile_id`);

-- 6. Scope emergency_cards: drop unique on user_id, add unique on care_profile_id
CREATE INDEX `idx_emer_user` ON `emergency_cards`(`user_id`);
DROP INDEX `user_id` ON `emergency_cards`;
ALTER TABLE `emergency_cards`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_emergency_cards_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD UNIQUE KEY `unique_emergency_care_profile` (`care_profile_id`);

-- 7. Scope health_assessments
ALTER TABLE `health_assessments`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_health_assessments_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_assessments_care_profile` (`care_profile_id`);

-- 8. Scope health_history: drop unique on (user_id, tracking_date), add unique on (care_profile_id, tracking_date)
DROP INDEX `unique_user_date` ON `health_history`;
ALTER TABLE `health_history`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_health_history_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_history_care_profile` (`care_profile_id`),
    ADD UNIQUE KEY `unique_profile_date` (`care_profile_id`, `tracking_date`);

-- 9. Scope hydration_logs
ALTER TABLE `hydration_logs`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_hydration_logs_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_hydration_care_profile` (`care_profile_id`);

-- 10. Scope sleep_logs
ALTER TABLE `sleep_logs`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_sleep_logs_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_sleep_care_profile` (`care_profile_id`);

-- 11. Scope exercise_logs
ALTER TABLE `exercise_logs`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_exercise_logs_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_exercise_care_profile` (`care_profile_id`);

-- 12. Scope nutrition_logs
ALTER TABLE `nutrition_logs`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_nutrition_logs_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_nutrition_care_profile` (`care_profile_id`);

-- 13. Scope wellness_goals
ALTER TABLE `wellness_goals`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_wellness_goals_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_goals_care_profile` (`care_profile_id`);

-- 14. Scope weekly_reports
ALTER TABLE `weekly_reports`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_weekly_reports_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_reports_care_profile` (`care_profile_id`);

-- 15. Scope doctor_shares
ALTER TABLE `doctor_shares`
    ADD COLUMN `care_profile_id` BIGINT NULL,
    ADD CONSTRAINT `fk_doctor_shares_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    ADD INDEX `idx_doctor_shares_care_profile` (`care_profile_id`);

-- 16. Backfill existing rows to primary profile
UPDATE `medicines` m JOIN `care_profiles` cp ON cp.`account_owner_id` = m.`user_id` AND cp.`is_primary` = TRUE SET m.`care_profile_id` = cp.`id` WHERE m.`care_profile_id` IS NULL;
UPDATE `symptom_logs` s JOIN `care_profiles` cp ON cp.`account_owner_id` = s.`user_id` AND cp.`is_primary` = TRUE SET s.`care_profile_id` = cp.`id` WHERE s.`care_profile_id` IS NULL;
UPDATE `doctor_appointments` d JOIN `care_profiles` cp ON cp.`account_owner_id` = d.`user_id` AND cp.`is_primary` = TRUE SET d.`care_profile_id` = cp.`id` WHERE d.`care_profile_id` IS NULL;
UPDATE `emergency_cards` e JOIN `care_profiles` cp ON cp.`account_owner_id` = e.`user_id` AND cp.`is_primary` = TRUE SET e.`care_profile_id` = cp.`id` WHERE e.`care_profile_id` IS NULL;
UPDATE `health_assessments` a JOIN `care_profiles` cp ON cp.`account_owner_id` = a.`user_id` AND cp.`is_primary` = TRUE SET a.`care_profile_id` = cp.`id` WHERE a.`care_profile_id` IS NULL;
UPDATE `health_history` h JOIN `care_profiles` cp ON cp.`account_owner_id` = h.`user_id` AND cp.`is_primary` = TRUE SET h.`care_profile_id` = cp.`id` WHERE h.`care_profile_id` IS NULL;
UPDATE `hydration_logs` hy JOIN `care_profiles` cp ON cp.`account_owner_id` = hy.`user_id` AND cp.`is_primary` = TRUE SET hy.`care_profile_id` = cp.`id` WHERE hy.`care_profile_id` IS NULL;
UPDATE `sleep_logs` sl JOIN `care_profiles` cp ON cp.`account_owner_id` = sl.`user_id` AND cp.`is_primary` = TRUE SET sl.`care_profile_id` = cp.`id` WHERE sl.`care_profile_id` IS NULL;
UPDATE `exercise_logs` ex JOIN `care_profiles` cp ON cp.`account_owner_id` = ex.`user_id` AND cp.`is_primary` = TRUE SET ex.`care_profile_id` = cp.`id` WHERE ex.`care_profile_id` IS NULL;
UPDATE `nutrition_logs` nu JOIN `care_profiles` cp ON cp.`account_owner_id` = nu.`user_id` AND cp.`is_primary` = TRUE SET nu.`care_profile_id` = cp.`id` WHERE nu.`care_profile_id` IS NULL;
UPDATE `wellness_goals` wg JOIN `care_profiles` cp ON cp.`account_owner_id` = wg.`user_id` AND cp.`is_primary` = TRUE SET wg.`care_profile_id` = cp.`id` WHERE wg.`care_profile_id` IS NULL;
UPDATE `weekly_reports` wr JOIN `care_profiles` cp ON cp.`account_owner_id` = wr.`user_id` AND cp.`is_primary` = TRUE SET wr.`care_profile_id` = cp.`id` WHERE wr.`care_profile_id` IS NULL;
UPDATE `doctor_shares` ds JOIN `care_profiles` cp ON cp.`account_owner_id` = ds.`user_id` AND cp.`is_primary` = TRUE SET ds.`care_profile_id` = cp.`id` WHERE ds.`care_profile_id` IS NULL;
