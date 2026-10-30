-- Migration 016: Scope caregiver access to specific care profile and add invite expiry
ALTER TABLE `caregiver_access`
    ADD COLUMN `care_profile_id` BIGINT NULL AFTER `account_owner_id`,
    ADD COLUMN `expires_at` DATETIME NULL AFTER `created_at`,
    ADD CONSTRAINT `fk_caregiver_care_profile` FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE;
