-- Migration 001: Add Care Profiles & Family / Caregiver Management
-- Allows one primary account to manage health records for multiple people (e.g. self, child, parent)

CREATE TABLE IF NOT EXISTS `care_profiles` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `account_owner_id` BIGINT NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `relationship` ENUM('SELF', 'CHILD', 'PARENT', 'SPOUSE', 'OTHER') DEFAULT 'OTHER',
    `date_of_birth` DATE NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') DEFAULT 'OTHER',
    `avatar_color` VARCHAR(20) DEFAULT '#0f766e',
    `is_primary` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_care_profiles_owner` (`account_owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Caregiver Invitations & Access
CREATE TABLE IF NOT EXISTS `caregiver_access` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `account_owner_id` BIGINT NOT NULL,
    `caregiver_email` VARCHAR(255) NOT NULL,
    `access_level` ENUM('VIEW_ONLY', 'EDIT') DEFAULT 'VIEW_ONLY',
    `invite_token` CHAR(64) UNIQUE NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REVOKED') DEFAULT 'PENDING',
    `notify_missed_dose` BOOLEAN DEFAULT TRUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `accepted_at` DATETIME NULL,
    FOREIGN KEY (`account_owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_caregiver_owner` (`account_owner_id`),
    INDEX `idx_caregiver_email` (`caregiver_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional profile_id on health and medicine records for multi-profile scoping
-- (NULL or matching primary care_profile default to the primary account owner)
