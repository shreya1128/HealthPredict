-- ============================================================================
-- HealthPredict: ADD-ONLY schema repair for an existing (older) database
-- ============================================================================
-- Brings an older `healthpredict` database up to the current schema WITHOUT
-- dropping, truncating, or overwriting any table, column, row or value.
--
--   * Creates tables that do not exist yet.
--   * Adds columns, indexes and foreign keys that do not exist yet.
--   * Widens two ENUM lists (only adds allowed values; existing values stay).
--   * Gives every user a primary care profile if they have none, then fills the
--     empty care_profile_id columns from it (same rule as migration 008).
--   * Only AFTER the new indexes exist, removes the two old UNIQUE indexes that
--     migration 008 removes (they would block multiple care profiles). No data
--     is touched by that step.
--
-- Safe to run more than once. Existing columns are never altered.
-- Requires MariaDB 10.2+ (you have 10.4.32).  BACK UP THE DATABASE FIRST.
-- Run it against the `healthpredict` database (not healthpredict_test).
-- ============================================================================
SET FOREIGN_KEY_CHECKS=0;
SET @OLD_SAFE_UPDATES=@@SQL_SAFE_UPDATES; SET SQL_SAFE_UPDATES=0;  -- Workbench blocks UPDATE ... WHERE <non-key> by default (this session only)
SET @OLD_SQL_MODE=@@SQL_MODE; SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';


-- ============================================================================
-- PART 1: Create tables that are missing (existing tables are left alone)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `email` VARCHAR(255) UNIQUE NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20),
    `date_of_birth` DATE,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') DEFAULT 'OTHER',
    `role` ENUM('USER', 'ADMIN') DEFAULT 'USER',
    `is_active` BOOLEAN DEFAULT TRUE,
    `email_verified` BOOLEAN DEFAULT FALSE,
    `quiet_hours_start` TIME NULL,
    `quiet_hours_end` TIME NULL,
    `reminder_lead_time_minutes` INT NOT NULL DEFAULT 15,
    `totp_secret` VARCHAR(64) NULL,
    `totp_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
    `last_login` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (`email`),
    INDEX idx_role (`role`),
    INDEX idx_created_at (`created_at`),
    INDEX idx_users_active (`role`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_profiles` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT UNIQUE NOT NULL,
    `height_cm` DECIMAL(5, 2),
    `weight_kg` DECIMAL(6, 2),
    `bmi` DECIMAL(5, 2) GENERATED ALWAYS AS (weight_kg / POW(height_cm/100, 2)) STORED,
    `waist_circumference_cm` DECIMAL(5, 2),
    `blood_type` VARCHAR(5),
    `allergies` JSON,
    `existing_conditions` JSON,
    `family_history` JSON,
    `exercise_frequency` ENUM('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'),
    `sleep_duration_hours` DECIMAL(4, 2),
    `smoking_status` ENUM('NEVER', 'FORMER', 'CURRENT'),
    `alcohol_consumption` ENUM('NEVER', 'OCCASIONALLY', 'REGULARLY', 'HEAVILY'),
    -- Self-reported, not a lab value. Nullable with no default (same reasoning as
    -- smoking_status/alcohol_consumption): unset means "not yet provided", never assumed normal.
    -- Added in Phase 5 to supply the ML model's 3rd-most-important feature (see docs/ml-methodology.md).
    `cholesterol_level` ENUM('NORMAL', 'ABOVE_NORMAL', 'WELL_ABOVE_NORMAL'),
    `diet_type` VARCHAR(100),
    `water_intake_goal_ml` INT DEFAULT 2500,
    `emergency_contact_name` VARCHAR(255),
    `emergency_contact_phone` VARCHAR(20),
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_tokens` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `token_type` ENUM('REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFY', 'TOTP_LOGIN', 'EMAIL_CHANGE') NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `used_at` DATETIME NULL,
    `revoked` BOOLEAN DEFAULT FALSE,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `device_name` VARCHAR(100) NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY uq_token_hash (`token_hash`),
    INDEX idx_user_token_type (`user_id`, `token_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `health_assessments` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `assessment_date` DATE NOT NULL,
    `systolic_bp` INT,
    `diastolic_bp` INT,
    `heart_rate_bpm` INT,
    `blood_glucose_mg_dl` INT,
    `spo2_percent` DECIMAL(5, 2),
    `temperature_celsius` DECIMAL(5, 2),
    `health_score` DECIMAL(5, 2),
    `risk_category` ENUM('LOW', 'MODERATE', 'HIGH') DEFAULT 'LOW',
    -- Rule-based component breakdown from app/utils/health_score.py (NOT the ML model - see health_predictions).
    -- Shape: {"components": [{"key","label","score","weight_pct"}], "skipped": [{"key","label","reason"}]}
    `score_breakdown` JSON,
    `data_completeness_percent` DECIMAL(5, 2),
    `assessment_notes` TEXT,
    `status` ENUM('PENDING', 'COMPLETED', 'REVIEWED') DEFAULT 'PENDING',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_assessment_date (`assessment_date`),
    INDEX idx_created_at (`created_at`),
    INDEX idx_assessment_risk (`user_id`, `risk_category`),
    INDEX idx_assessments_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `health_predictions` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `assessment_id` BIGINT UNIQUE NOT NULL,
    `prediction_score` DECIMAL(5, 4),
    `risk_level` ENUM('LOW', 'MODERATE', 'HIGH') DEFAULT 'MODERATE',
    `confidence_percent` DECIMAL(5, 2),
    `feature_importance` JSON,
    `model_version` VARCHAR(50),
    `shap_values` JSON,
    `prediction_factors` JSON,
    `explanation_text` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`assessment_id`) REFERENCES `health_assessments`(`id`) ON DELETE CASCADE,
    INDEX idx_assessment_id (`assessment_id`),
    INDEX idx_risk_level (`risk_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `health_history` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `tracking_date` DATE NOT NULL,
    `health_score` DECIMAL(5, 2),
    `weight_kg` DECIMAL(6, 2),
    `bmi` DECIMAL(5, 2),
    `systolic_bp` INT,
    `diastolic_bp` INT,
    `heart_rate_bpm` INT,
    `blood_glucose_mg_dl` INT,
    `spo2_percent` DECIMAL(5, 2),
    `risk_category` ENUM('LOW', 'MODERATE', 'HIGH') DEFAULT 'LOW',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_tracking_date (`tracking_date`),
    INDEX idx_user_health_latest (`user_id`, `tracking_date`),
    INDEX idx_history_care_profile (`care_profile_id`),
    UNIQUE KEY unique_profile_date (`care_profile_id`, `tracking_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medicines` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `medicine_name` VARCHAR(255) NOT NULL,
    `dosage` DECIMAL(10, 2),
    `dosage_unit` VARCHAR(50),
    `form` ENUM('TABLET', 'CAPSULE', 'LIQUID', 'INJECTION', 'PATCH', 'OTHER') DEFAULT 'TABLET',
    `frequency` INT DEFAULT 1,
    `frequency_unit` ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED') DEFAULT 'DAILY',
    `start_date` DATE NOT NULL,
    `end_date` DATE,
    `time_of_day` JSON,
    `instructions` TEXT,
    `reason_for_use` VARCHAR(255),
    `weekdays` JSON,
    `month_day` SMALLINT,
    `notes` TEXT,
    `rxcui` VARCHAR(50),
    `quantity_on_hand` INT,
    `pills_per_dose` INT DEFAULT 1,
    `refill_threshold_days` INT DEFAULT 7,
    `pharmacy_note` TEXT,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_is_active (`is_active`),
    INDEX idx_start_date (`start_date`),
    INDEX idx_user_medicines_active (`user_id`, `is_active`, `start_date`),
    INDEX idx_medicines_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medicine_schedules` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `medicine_id` BIGINT NOT NULL,
    `scheduled_date` DATE NOT NULL,
    `scheduled_time` TIME,
    `is_taken` BOOLEAN DEFAULT FALSE,
    `is_skipped` BOOLEAN DEFAULT FALSE,
    `taken_at` DATETIME,
    `skipped_reason` VARCHAR(255),
    `dosage_at_intake` DECIMAL(10, 2),
    `dosage_unit_at_intake` VARCHAR(50),
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE CASCADE,
    INDEX idx_medicine_id (`medicine_id`),
    INDEX idx_scheduled_date (`scheduled_date`),
    INDEX idx_medicine_adherence (`medicine_id`, `scheduled_date`),
    UNIQUE KEY unique_medicine_schedule (`medicine_id`, `scheduled_date`, `scheduled_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medicine_intake_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `medicine_id` BIGINT NOT NULL,
    `log_date` DATE NOT NULL,
    `taken_count` INT DEFAULT 0,
    `skipped_count` INT DEFAULT 0,
    `missed_count` INT DEFAULT 0,
    `adherence_percent` DECIMAL(5, 2),
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE CASCADE,
    INDEX idx_medicine_id (`medicine_id`),
    INDEX idx_log_date (`log_date`),
    UNIQUE KEY unique_medicine_log (`medicine_id`, `log_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exercise_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `exercise_date` DATE NOT NULL,
    `exercise_type` VARCHAR(100) NOT NULL,
    `duration_minutes` INT,
    `intensity` ENUM('LOW', 'MODERATE', 'HIGH') DEFAULT 'MODERATE',
    `calories_burned` INT,
    `distance_km` DECIMAL(10, 2),
    `source` VARCHAR(50) NOT NULL DEFAULT 'manual',
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_exercise_date (`exercise_date`),
    INDEX idx_user_exercise_weekly (`user_id`, `exercise_date`),
    INDEX idx_exercise_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sleep_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `sleep_date` DATE NOT NULL,
    `bedtime` TIME,
    `wake_time` TIME,
    `sleep_duration_hours` DECIMAL(4, 2),
    `sleep_quality` INT,
    `source` VARCHAR(50) NOT NULL DEFAULT 'manual',
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_sleep_date (`sleep_date`),
    INDEX idx_user_sleep_weekly (`user_id`, `sleep_date`),
    INDEX idx_sleep_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hydration_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `hydration_date` DATE NOT NULL,
    `water_intake_ml` INT NOT NULL,
    `entry_time` TIME,
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_hydration_date (`hydration_date`),
    INDEX idx_hydration_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `nutrition_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `nutrition_date` DATE NOT NULL,
    `meal_type` ENUM('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK') NOT NULL,
    `food_item` VARCHAR(255),
    `calories` INT,
    `portion_size` VARCHAR(100),
    `macros` JSON,
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_nutrition_date (`nutrition_date`),
    INDEX idx_nutrition_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wellness_goals` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `goal_type` ENUM('EXERCISE', 'SLEEP', 'HYDRATION', 'WEIGHT', 'MEDICINE_ADHERENCE', 'OTHER') NOT NULL,
    `goal_description` VARCHAR(255),
    `target_value` DECIMAL(10, 2),
    `baseline_value` DECIMAL(10, 2),
    `manual_percentage` DECIMAL(5, 2),
    `unit` VARCHAR(50),
    `start_date` DATE NOT NULL,
    `end_date` DATE,
    `is_achieved` BOOLEAN DEFAULT FALSE,
    `status` ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED') DEFAULT 'ACTIVE',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_status (`status`),
    INDEX idx_goals_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `goal_progress` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `goal_id` BIGINT NOT NULL,
    `progress_date` DATE NOT NULL,
    `progress_value` DECIMAL(10, 2),
    `percentage_complete` DECIMAL(5, 2),
    `notes` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`goal_id`) REFERENCES `wellness_goals`(`id`) ON DELETE CASCADE,
    INDEX idx_goal_id (`goal_id`),
    INDEX idx_progress_date (`progress_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `notification_type` ENUM('MEDICINE_REMINDER', 'MISSED_MEDICINE', 'WEEKLY_REPORT', 'ASSESSMENT_COMPLETED', 'GOAL_PROGRESS', 'WELLNESS_REMINDER', 'ADMIN_MESSAGE', 'REFILL_ALERT', 'APPOINTMENT_REMINDER', 'STREAK_MILESTONE') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT,
    `is_read` BOOLEAN DEFAULT FALSE,
    `read_at` DATETIME,
    `sent_at` DATETIME,
    `snoozed_until` DATETIME,
    `related_entity_type` VARCHAR(100),
    `related_entity_id` BIGINT,
    `action_url` VARCHAR(500),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_is_read (`is_read`),
    INDEX idx_created_at (`created_at`),
    INDEX idx_notification_unread (`user_id`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `weekly_reports` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `week_start_date` DATE NOT NULL,
    `week_end_date` DATE NOT NULL,
    `average_health_score` DECIMAL(5, 2),
    `weight_change_kg` DECIMAL(6, 2),
    `total_exercise_minutes` INT,
    `average_sleep_duration` DECIMAL(4, 2),
    `average_hydration_ml` INT,
    `medicine_adherence_percent` DECIMAL(5, 2),
    `goals_progress_percent` DECIMAL(5, 2),
    `significant_changes` JSON,
    `recommendations` JSON,
    `pdf_file_path` VARCHAR(500),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX idx_user_id (`user_id`),
    INDEX idx_week_start_date (`week_start_date`),
    INDEX idx_weekly_report_user (`user_id`, `week_start_date`),
    INDEX idx_reports_care_profile (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `admin_id` BIGINT NOT NULL,
    `action_type` VARCHAR(100) NOT NULL,
    `target_entity_type` VARCHAR(100),
    `target_entity_id` BIGINT,
    `old_values` JSON,
    `new_values` JSON,
    `details` TEXT,
    `ip_address` VARCHAR(45),
    `user_agent` VARCHAR(500),
    `status` ENUM('SUCCESS', 'FAILED') DEFAULT 'SUCCESS',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX idx_admin_id (`admin_id`),
    INDEX idx_action_type (`action_type`),
    INDEX idx_created_at (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `caregiver_access` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `account_owner_id` BIGINT NOT NULL,
    `caregiver_email` VARCHAR(255) NOT NULL,
    `access_level` ENUM('VIEW_ONLY', 'EDIT') DEFAULT 'VIEW_ONLY',
    `invite_token` CHAR(64) UNIQUE NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REVOKED') DEFAULT 'PENDING',
    `notify_missed_dose` BOOLEAN DEFAULT TRUE,
    `caregiver_user_id` BIGINT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `accepted_at` DATETIME NULL,
    FOREIGN KEY (`account_owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`caregiver_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_caregiver_owner` (`account_owner_id`),
    INDEX `idx_caregiver_email` (`caregiver_email`),
    INDEX `idx_caregiver_user_id` (`caregiver_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `doctor_shares` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `token` CHAR(64) UNIQUE NOT NULL,
    `days_range` INT DEFAULT 30,
    `questions_for_doctor` JSON NULL,
    `doctor_name` VARCHAR(255) NULL,
    `doctor_notes` TEXT NULL,
    `doctor_reviewed_at` DATETIME NULL,
    `doctor_recommendations` JSON NULL,
    `expires_at` DATETIME NOT NULL,
    `is_revoked` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX `idx_docshare_token` (`token`),
    INDEX `idx_docshare_user` (`user_id`),
    INDEX `idx_doctor_shares_care_profile` (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `doctor_share_notes` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `doctor_share_id` BIGINT NOT NULL,
    `author_name` VARCHAR(255) NOT NULL,
    `note_text` VARCHAR(2000) NOT NULL,
    `is_hidden` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`doctor_share_id`) REFERENCES `doctor_shares`(`id`) ON DELETE CASCADE,
    INDEX `idx_docshare_notes_share` (`doctor_share_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `emergency_cards` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT UNIQUE NULL,
    `public_token` CHAR(64) UNIQUE NOT NULL,
    `blood_type` VARCHAR(10) NULL,
    `allergies` JSON NULL,
    `chronic_conditions` JSON NULL,
    `current_medications` JSON NULL,
    `emergency_contact_name` VARCHAR(255) NULL,
    `emergency_contact_phone` VARCHAR(30) NULL,
    `emergency_contact_relationship` VARCHAR(100) NULL,
    `organ_donor` BOOLEAN DEFAULT FALSE,
    `medical_notes` TEXT NULL,
    `is_public` BOOLEAN DEFAULT FALSE,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX `idx_emer_user` (`user_id`),
    INDEX `idx_emer_token` (`public_token`),
    INDEX `idx_emer_care_profile` (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `symptom_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `symptom_name` VARCHAR(255) NOT NULL,
    `severity` INT NOT NULL,
    `logged_at` DATETIME NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX `idx_symptom_user_date` (`user_id`, `logged_at`),
    INDEX `idx_symptoms_care_profile` (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `doctor_appointments` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `care_profile_id` BIGINT NULL,
    `doctor_name` VARCHAR(255) NOT NULL,
    `specialty` VARCHAR(100) NULL,
    `location` VARCHAR(255) NULL,
    `appointment_date` DATETIME NOT NULL,
    `reason_for_visit` VARCHAR(255) NULL,
    `questions_to_ask` JSON NULL,
    `doctor_notes` TEXT NULL,
    `followup_date` DATE NULL,
    `status` ENUM('UPCOMING', 'COMPLETED', 'CANCELLED') DEFAULT 'UPCOMING',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`care_profile_id`) REFERENCES `care_profiles`(`id`) ON DELETE CASCADE,
    INDEX `idx_appts_user_date` (`user_id`, `appointment_date`),
    INDEX `idx_doctor_appointments_care_profile` (`care_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_device_tokens` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `push_token` VARCHAR(255) NOT NULL,
    `p256dh` VARCHAR(255) NULL,
    `auth` VARCHAR(255) NULL,
    `platform` VARCHAR(20) NOT NULL DEFAULT 'expo',
    `device_name` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_user_push_token` (`user_id`, `push_token`),
    INDEX `idx_user_devices` (`user_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `token_blocklist` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `jti` VARCHAR(64) UNIQUE NOT NULL,
    `user_id` BIGINT NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_jti (`jti`),
    INDEX idx_expires_at (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ml_model_info` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `model_name` VARCHAR(255) NOT NULL,
    `model_version` VARCHAR(50),
    `algorithm` VARCHAR(100),
    `accuracy` DECIMAL(5, 4),
    `precision` DECIMAL(5, 4),
    `recall` DECIMAL(5, 4),
    `f1_score` DECIMAL(5, 4),
    `roc_auc` DECIMAL(5, 4),
    `training_date` DATETIME,
    `training_samples` INT,
    `feature_count` INT,
    `is_active` BOOLEAN DEFAULT FALSE,
    `metadata` JSON,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_model_version (`model_version`),
    INDEX idx_is_active (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `drug_interaction_cache` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `drug_a_rxcui` VARCHAR(50) NULL,
    `drug_b_rxcui` VARCHAR(50) NULL,
    `drug_a_name` VARCHAR(255) NOT NULL,
    `drug_b_name` VARCHAR(255) NOT NULL,
    `severity` VARCHAR(50) NOT NULL DEFAULT 'MODERATE',
    `description` TEXT NOT NULL,
    `source` VARCHAR(100) NOT NULL DEFAULT 'openfda',
    `cached_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drug_a_rxcui (`drug_a_rxcui`),
    INDEX idx_drug_b_rxcui (`drug_b_rxcui`),
    INDEX idx_drug_names (`drug_a_name`, `drug_b_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS diabetes_screenings (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    care_profile_id BIGINT NULL,
    screening_date DATE NOT NULL,
    method VARCHAR(50) NOT NULL DEFAULT 'ADA_FINDRISC_V1',
    total_score INT NOT NULL,
    risk_level VARCHAR(20) NOT NULL, -- LOW, MODERATE, HIGH, VERY_HIGH
    risk_probability_text VARCHAR(100) NOT NULL,
    input_data JSON NOT NULL,
    clinical_guidance TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_diab_user_date (user_id, screening_date),
    INDEX idx_diab_profile (care_profile_id),
    CONSTRAINT fk_diab_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_diab_profile FOREIGN KEY (care_profile_id) REFERENCES care_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menstrual_logs (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    care_profile_id BIGINT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NULL,
    cycle_length_days INT NULL,
    period_duration_days INT NULL,
    flow_intensity VARCHAR(20) NULL, -- LIGHT, MEDIUM, HEAVY, SPOTTING
    pain_level INT NULL, -- 0 to 10
    symptoms JSON NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_menstrual_user_date (user_id, period_start_date),
    INDEX idx_menstrual_profile (care_profile_id),
    CONSTRAINT fk_menstrual_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_menstrual_profile FOREIGN KEY (care_profile_id) REFERENCES care_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pcos_screenings (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    care_profile_id BIGINT NULL,
    screening_date DATE NOT NULL,
    cycle_regularity VARCHAR(30) NOT NULL, -- REGULAR, IRREGULAR, INFREQUENT
    excess_androgen_symptoms JSON NOT NULL,
    metabolic_indicators JSON NOT NULL,
    ultrasound_findings VARCHAR(50) NULL,
    symptom_count INT NOT NULL,
    risk_assessment_text VARCHAR(150) NOT NULL,
    educational_guidance TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pcos_user (user_id, screening_date),
    INDEX idx_pcos_profile (care_profile_id),
    CONSTRAINT fk_pcos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcos_profile FOREIGN KEY (care_profile_id) REFERENCES care_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fatty_liver_screenings (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    care_profile_id BIGINT NULL,
    screening_date DATE NOT NULL,
    bmi DECIMAL(5,2) NOT NULL,
    waist_circumference_cm DECIMAL(5,2) NOT NULL,
    has_hypertension BOOLEAN NOT NULL DEFAULT FALSE,
    has_type2_diabetes_or_prediabetes BOOLEAN NOT NULL DEFAULT FALSE,
    high_triglycerides BOOLEAN NOT NULL DEFAULT FALSE,
    low_hdl BOOLEAN NOT NULL DEFAULT FALSE,
    alcohol_units_weekly INT NOT NULL DEFAULT 0,
    alt_u_l DECIMAL(6,2) NULL,
    ast_u_l DECIMAL(6,2) NULL,
    prior_imaging_steatosis VARCHAR(30) NULL,
    metabolic_factors_count INT NOT NULL,
    risk_level VARCHAR(30) NOT NULL,
    risk_summary VARCHAR(150) NOT NULL,
    educational_guidance TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_liver_user_date (user_id, screening_date),
    INDEX idx_liver_profile (care_profile_id),
    CONSTRAINT fk_liver_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_liver_profile FOREIGN KEY (care_profile_id) REFERENCES care_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- PART 2: Add columns that are missing
-- ============================================================================
ALTER TABLE `admin_audit_logs`
    ADD COLUMN IF NOT EXISTS `admin_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `action_type` varchar(100) NOT NULL,
    ADD COLUMN IF NOT EXISTS `target_entity_type` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `target_entity_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
    ADD COLUMN IF NOT EXISTS `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
    ADD COLUMN IF NOT EXISTS `details` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `ip_address` varchar(45) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `user_agent` varchar(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `status` enum('SUCCESS','FAILED') DEFAULT 'SUCCESS',
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `caregiver_access`
    ADD COLUMN IF NOT EXISTS `account_owner_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `caregiver_email` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `access_level` enum('VIEW_ONLY','EDIT') DEFAULT 'VIEW_ONLY',
    ADD COLUMN IF NOT EXISTS `invite_token` char(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `status` enum('PENDING','ACCEPTED','REVOKED') DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS `notify_missed_dose` tinyint(1) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `caregiver_user_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `accepted_at` datetime DEFAULT NULL;

ALTER TABLE `care_profiles`
    ADD COLUMN IF NOT EXISTS `account_owner_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `full_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `relationship` enum('SELF','CHILD','PARENT','SPOUSE','OTHER') DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS `date_of_birth` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `gender` enum('MALE','FEMALE','OTHER') DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS `avatar_color` varchar(20) DEFAULT '#0f766e',
    ADD COLUMN IF NOT EXISTS `is_primary` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `diabetes_screenings`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `screening_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `method` varchar(50) NOT NULL DEFAULT 'ADA_FINDRISC_V1',
    ADD COLUMN IF NOT EXISTS `total_score` int(11) NOT NULL,
    ADD COLUMN IF NOT EXISTS `risk_level` varchar(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `risk_probability_text` varchar(100) NOT NULL,
    ADD COLUMN IF NOT EXISTS `input_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`input_data`)),
    ADD COLUMN IF NOT EXISTS `clinical_guidance` text NOT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `doctor_appointments`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `doctor_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `specialty` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `location` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `appointment_date` datetime NOT NULL,
    ADD COLUMN IF NOT EXISTS `reason_for_visit` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `questions_to_ask` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`questions_to_ask`)),
    ADD COLUMN IF NOT EXISTS `doctor_notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `followup_date` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `status` enum('UPCOMING','COMPLETED','CANCELLED') DEFAULT 'UPCOMING',
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `doctor_shares`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `token` char(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `days_range` int(11) DEFAULT 30,
    ADD COLUMN IF NOT EXISTS `questions_for_doctor` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`questions_for_doctor`)),
    ADD COLUMN IF NOT EXISTS `doctor_name` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `doctor_notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `doctor_reviewed_at` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `doctor_recommendations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`doctor_recommendations`)),
    ADD COLUMN IF NOT EXISTS `expires_at` datetime NOT NULL,
    ADD COLUMN IF NOT EXISTS `is_revoked` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `doctor_share_notes`
    ADD COLUMN IF NOT EXISTS `doctor_share_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `author_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `note_text` varchar(2000) NOT NULL,
    ADD COLUMN IF NOT EXISTS `is_hidden` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `drug_interaction_cache`
    ADD COLUMN IF NOT EXISTS `drug_a_rxcui` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `drug_b_rxcui` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `drug_a_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `drug_b_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `severity` varchar(50) NOT NULL DEFAULT 'MODERATE',
    ADD COLUMN IF NOT EXISTS `description` text NOT NULL,
    ADD COLUMN IF NOT EXISTS `source` varchar(100) NOT NULL DEFAULT 'openfda',
    ADD COLUMN IF NOT EXISTS `cached_at` datetime DEFAULT current_timestamp();

ALTER TABLE `emergency_cards`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `public_token` char(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `blood_type` varchar(10) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `allergies` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`allergies`)),
    ADD COLUMN IF NOT EXISTS `chronic_conditions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`chronic_conditions`)),
    ADD COLUMN IF NOT EXISTS `current_medications` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`current_medications`)),
    ADD COLUMN IF NOT EXISTS `emergency_contact_name` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `emergency_contact_phone` varchar(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `emergency_contact_relationship` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `organ_donor` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `medical_notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_public` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `exercise_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `exercise_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `exercise_type` varchar(100) NOT NULL,
    ADD COLUMN IF NOT EXISTS `duration_minutes` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `intensity` enum('LOW','MODERATE','HIGH') DEFAULT 'MODERATE',
    ADD COLUMN IF NOT EXISTS `calories_burned` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `distance_km` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `source` varchar(50) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `fatty_liver_screenings`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `screening_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `bmi` decimal(5,2) NOT NULL,
    ADD COLUMN IF NOT EXISTS `waist_circumference_cm` decimal(5,2) NOT NULL,
    ADD COLUMN IF NOT EXISTS `has_hypertension` tinyint(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `has_type2_diabetes_or_prediabetes` tinyint(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `high_triglycerides` tinyint(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `low_hdl` tinyint(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `alcohol_units_weekly` int(11) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `alt_u_l` decimal(6,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `ast_u_l` decimal(6,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `prior_imaging_steatosis` varchar(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `metabolic_factors_count` int(11) NOT NULL,
    ADD COLUMN IF NOT EXISTS `risk_level` varchar(30) NOT NULL,
    ADD COLUMN IF NOT EXISTS `risk_summary` varchar(150) NOT NULL,
    ADD COLUMN IF NOT EXISTS `educational_guidance` text NOT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `goal_progress`
    ADD COLUMN IF NOT EXISTS `goal_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `progress_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `progress_value` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `percentage_complete` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `health_assessments`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `assessment_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `systolic_bp` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `diastolic_bp` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `heart_rate_bpm` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `blood_glucose_mg_dl` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `spo2_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `temperature_celsius` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `health_score` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `risk_category` enum('LOW','MODERATE','HIGH') DEFAULT 'LOW',
    ADD COLUMN IF NOT EXISTS `score_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`score_breakdown`)),
    ADD COLUMN IF NOT EXISTS `data_completeness_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `assessment_notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `status` enum('PENDING','COMPLETED','REVIEWED') DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `health_history`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `tracking_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `health_score` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `weight_kg` decimal(6,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `bmi` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `systolic_bp` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `diastolic_bp` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `heart_rate_bpm` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `blood_glucose_mg_dl` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `spo2_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `risk_category` enum('LOW','MODERATE','HIGH') DEFAULT 'LOW',
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `health_predictions`
    ADD COLUMN IF NOT EXISTS `assessment_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `prediction_score` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `risk_level` enum('LOW','MODERATE','HIGH') DEFAULT 'MODERATE',
    ADD COLUMN IF NOT EXISTS `confidence_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `feature_importance` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`feature_importance`)),
    ADD COLUMN IF NOT EXISTS `model_version` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `shap_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`shap_values`)),
    ADD COLUMN IF NOT EXISTS `prediction_factors` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`prediction_factors`)),
    ADD COLUMN IF NOT EXISTS `explanation_text` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `hydration_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `hydration_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `water_intake_ml` int(11) NOT NULL,
    ADD COLUMN IF NOT EXISTS `entry_time` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `medicines`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `medicine_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `dosage` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `dosage_unit` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `form` enum('TABLET','CAPSULE','LIQUID','INJECTION','PATCH','OTHER') DEFAULT 'TABLET',
    ADD COLUMN IF NOT EXISTS `frequency` int(11) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `frequency_unit` enum('DAILY','WEEKLY','MONTHLY','AS_NEEDED') DEFAULT 'DAILY',
    ADD COLUMN IF NOT EXISTS `start_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `end_date` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `time_of_day` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`time_of_day`)),
    ADD COLUMN IF NOT EXISTS `instructions` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `reason_for_use` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `weekdays` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`weekdays`)),
    ADD COLUMN IF NOT EXISTS `month_day` smallint(6) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `rxcui` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `quantity_on_hand` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `pills_per_dose` int(11) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `refill_threshold_days` int(11) DEFAULT 7,
    ADD COLUMN IF NOT EXISTS `pharmacy_note` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `medicine_intake_logs`
    ADD COLUMN IF NOT EXISTS `medicine_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `log_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `taken_count` int(11) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `skipped_count` int(11) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `missed_count` int(11) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `adherence_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `medicine_schedules`
    ADD COLUMN IF NOT EXISTS `medicine_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `scheduled_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `scheduled_time` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_taken` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `is_skipped` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `taken_at` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `skipped_reason` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `dosage_at_intake` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `dosage_unit_at_intake` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `menstrual_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `period_start_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `period_end_date` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `cycle_length_days` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `period_duration_days` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `flow_intensity` varchar(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `pain_level` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `symptoms` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`symptoms`)),
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `ml_model_info`
    ADD COLUMN IF NOT EXISTS `model_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `model_version` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `algorithm` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `accuracy` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `precision` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `recall` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `f1_score` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `roc_auc` decimal(5,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `training_date` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `training_samples` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `feature_count` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `notifications`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `notification_type` enum('MEDICINE_REMINDER','MISSED_MEDICINE','WEEKLY_REPORT','ASSESSMENT_COMPLETED','GOAL_PROGRESS','WELLNESS_REMINDER','ADMIN_MESSAGE','REFILL_ALERT','APPOINTMENT_REMINDER','STREAK_MILESTONE') NOT NULL,
    ADD COLUMN IF NOT EXISTS `title` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `message` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_read` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `read_at` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `sent_at` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `snoozed_until` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `related_entity_type` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `related_entity_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `action_url` varchar(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `nutrition_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `nutrition_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `meal_type` enum('BREAKFAST','LUNCH','DINNER','SNACK') NOT NULL,
    ADD COLUMN IF NOT EXISTS `food_item` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `calories` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `portion_size` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `macros` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`macros`)),
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `pcos_screenings`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `screening_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `cycle_regularity` varchar(30) NOT NULL,
    ADD COLUMN IF NOT EXISTS `excess_androgen_symptoms` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`excess_androgen_symptoms`)),
    ADD COLUMN IF NOT EXISTS `metabolic_indicators` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`metabolic_indicators`)),
    ADD COLUMN IF NOT EXISTS `ultrasound_findings` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `symptom_count` int(11) NOT NULL,
    ADD COLUMN IF NOT EXISTS `risk_assessment_text` varchar(150) NOT NULL,
    ADD COLUMN IF NOT EXISTS `educational_guidance` text NOT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `sleep_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `sleep_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `bedtime` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `wake_time` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `sleep_duration_hours` decimal(4,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `sleep_quality` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `source` varchar(50) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `symptom_logs`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `symptom_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `severity` int(11) NOT NULL,
    ADD COLUMN IF NOT EXISTS `logged_at` datetime NOT NULL,
    ADD COLUMN IF NOT EXISTS `notes` text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `token_blocklist`
    ADD COLUMN IF NOT EXISTS `jti` varchar(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `expires_at` datetime NOT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `email` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `password_hash` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `full_name` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `phone` varchar(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `date_of_birth` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `gender` enum('MALE','FEMALE','OTHER') DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS `role` enum('USER','ADMIN') DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `email_verified` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `quiet_hours_start` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `quiet_hours_end` time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `reminder_lead_time_minutes` int(11) NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS `totp_secret` varchar(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `totp_enabled` tinyint(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `last_login` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `user_device_tokens`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `push_token` varchar(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS `p256dh` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `auth` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `platform` varchar(20) NOT NULL DEFAULT 'expo',
    ADD COLUMN IF NOT EXISTS `device_name` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `user_profiles`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `height_cm` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `weight_kg` decimal(6,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `bmi` decimal(5,2) GENERATED ALWAYS AS (`weight_kg` / pow(`height_cm` / 100,2)) STORED,
    ADD COLUMN IF NOT EXISTS `waist_circumference_cm` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `blood_type` varchar(5) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `allergies` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`allergies`)),
    ADD COLUMN IF NOT EXISTS `existing_conditions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`existing_conditions`)),
    ADD COLUMN IF NOT EXISTS `family_history` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`family_history`)),
    ADD COLUMN IF NOT EXISTS `exercise_frequency` enum('SEDENTARY','LIGHT','MODERATE','ACTIVE','VERY_ACTIVE') DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `sleep_duration_hours` decimal(4,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `smoking_status` enum('NEVER','FORMER','CURRENT') DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `alcohol_consumption` enum('NEVER','OCCASIONALLY','REGULARLY','HEAVILY') DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `cholesterol_level` enum('NORMAL','ABOVE_NORMAL','WELL_ABOVE_NORMAL') DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `diet_type` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `water_intake_goal_ml` int(11) DEFAULT 2500,
    ADD COLUMN IF NOT EXISTS `emergency_contact_name` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `emergency_contact_phone` varchar(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `user_tokens`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `token_hash` char(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `token_type` enum('REFRESH','PASSWORD_RESET','EMAIL_VERIFY','TOTP_LOGIN','EMAIL_CHANGE') NOT NULL,
    ADD COLUMN IF NOT EXISTS `expires_at` datetime NOT NULL,
    ADD COLUMN IF NOT EXISTS `used_at` datetime DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `revoked` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `ip_address` varchar(45) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `user_agent` varchar(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `device_name` varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `weekly_reports`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `week_start_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `week_end_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `average_health_score` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `weight_change_kg` decimal(6,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `total_exercise_minutes` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `average_sleep_duration` decimal(4,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `average_hydration_ml` int(11) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `medicine_adherence_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `goals_progress_percent` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `significant_changes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`significant_changes`)),
    ADD COLUMN IF NOT EXISTS `recommendations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`recommendations`)),
    ADD COLUMN IF NOT EXISTS `pdf_file_path` varchar(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp();

ALTER TABLE `wellness_goals`
    ADD COLUMN IF NOT EXISTS `user_id` bigint(20) NOT NULL,
    ADD COLUMN IF NOT EXISTS `care_profile_id` bigint(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `goal_type` enum('EXERCISE','SLEEP','HYDRATION','WEIGHT','MEDICINE_ADHERENCE','OTHER') NOT NULL,
    ADD COLUMN IF NOT EXISTS `goal_description` varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `target_value` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `baseline_value` decimal(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `manual_percentage` decimal(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `unit` varchar(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `start_date` date NOT NULL,
    ADD COLUMN IF NOT EXISTS `end_date` date DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `is_achieved` tinyint(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `status` enum('ACTIVE','PAUSED','COMPLETED','ABANDONED') DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS `created_at` datetime DEFAULT current_timestamp(),
    ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp();


-- ============================================================================
-- PART 3: Widen ENUM lists (adds new allowed values only)
-- ============================================================================
ALTER TABLE `notifications` MODIFY COLUMN `notification_type` enum('MEDICINE_REMINDER','MISSED_MEDICINE','WEEKLY_REPORT','ASSESSMENT_COMPLETED','GOAL_PROGRESS','WELLNESS_REMINDER','ADMIN_MESSAGE','REFILL_ALERT','APPOINTMENT_REMINDER','STREAK_MILESTONE') NOT NULL;

ALTER TABLE `user_tokens` MODIFY COLUMN `token_type` enum('REFRESH','PASSWORD_RESET','EMAIL_VERIFY','TOTP_LOGIN','EMAIL_CHANGE') NOT NULL;


-- ============================================================================
-- PART 4: Give every user a primary care profile if they do not have one
-- ============================================================================
INSERT INTO `care_profiles` (`account_owner_id`, `full_name`, `relationship`, `gender`, `is_primary`, `created_at`, `updated_at`)
SELECT u.`id`, COALESCE(u.`full_name`, 'Primary User'), 'SELF', COALESCE(u.`gender`, 'OTHER'), TRUE, NOW(), NOW()
FROM `users` u
LEFT JOIN `care_profiles` cp ON cp.`account_owner_id` = u.`id` AND cp.`is_primary` = TRUE
WHERE cp.`id` IS NULL;


-- ============================================================================
-- PART 5: Fill empty care_profile_id values from each user's primary profile
-- ============================================================================
UPDATE `diabetes_screenings` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `doctor_appointments` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `doctor_shares` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `emergency_cards` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `exercise_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `fatty_liver_screenings` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `health_assessments` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `health_history` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `hydration_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `medicines` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `menstrual_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `nutrition_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `pcos_screenings` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `sleep_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `symptom_logs` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `weekly_reports` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;
UPDATE `wellness_goals` x JOIN `care_profiles` cp ON cp.`account_owner_id` = x.`user_id` AND cp.`is_primary` = TRUE SET x.`care_profile_id` = cp.`id` WHERE x.`care_profile_id` IS NULL;


-- ============================================================================
-- PART 6: Add indexes that are missing
-- ============================================================================
ALTER TABLE `admin_audit_logs`
    ADD INDEX IF NOT EXISTS `idx_admin_id` (`admin_id`),
    ADD INDEX IF NOT EXISTS `idx_action_type` (`action_type`),
    ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`);

ALTER TABLE `caregiver_access`
    ADD UNIQUE INDEX IF NOT EXISTS `invite_token` (`invite_token`),
    ADD INDEX IF NOT EXISTS `idx_caregiver_owner` (`account_owner_id`),
    ADD INDEX IF NOT EXISTS `idx_caregiver_email` (`caregiver_email`),
    ADD INDEX IF NOT EXISTS `idx_caregiver_user_id` (`caregiver_user_id`);

ALTER TABLE `care_profiles`
    ADD INDEX IF NOT EXISTS `idx_care_profiles_owner` (`account_owner_id`);

ALTER TABLE `diabetes_screenings`
    ADD INDEX IF NOT EXISTS `idx_diab_user_date` (`user_id`,`screening_date`),
    ADD INDEX IF NOT EXISTS `idx_diab_profile` (`care_profile_id`);

ALTER TABLE `doctor_appointments`
    ADD INDEX IF NOT EXISTS `idx_appts_user_date` (`user_id`,`appointment_date`),
    ADD INDEX IF NOT EXISTS `idx_doctor_appointments_care_profile` (`care_profile_id`);

ALTER TABLE `doctor_shares`
    ADD UNIQUE INDEX IF NOT EXISTS `token` (`token`),
    ADD INDEX IF NOT EXISTS `idx_docshare_token` (`token`),
    ADD INDEX IF NOT EXISTS `idx_docshare_user` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_doctor_shares_care_profile` (`care_profile_id`);

ALTER TABLE `doctor_share_notes`
    ADD INDEX IF NOT EXISTS `idx_docshare_notes_share` (`doctor_share_id`);

ALTER TABLE `drug_interaction_cache`
    ADD INDEX IF NOT EXISTS `idx_drug_a_rxcui` (`drug_a_rxcui`),
    ADD INDEX IF NOT EXISTS `idx_drug_b_rxcui` (`drug_b_rxcui`),
    ADD INDEX IF NOT EXISTS `idx_drug_names` (`drug_a_name`,`drug_b_name`);

ALTER TABLE `emergency_cards`
    ADD UNIQUE INDEX IF NOT EXISTS `public_token` (`public_token`),
    ADD UNIQUE INDEX IF NOT EXISTS `care_profile_id` (`care_profile_id`),
    ADD INDEX IF NOT EXISTS `idx_emer_user` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_emer_token` (`public_token`),
    ADD INDEX IF NOT EXISTS `idx_emer_care_profile` (`care_profile_id`);

ALTER TABLE `exercise_logs`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_exercise_date` (`exercise_date`),
    ADD INDEX IF NOT EXISTS `idx_user_exercise_weekly` (`user_id`,`exercise_date`),
    ADD INDEX IF NOT EXISTS `idx_exercise_care_profile` (`care_profile_id`);

ALTER TABLE `fatty_liver_screenings`
    ADD INDEX IF NOT EXISTS `idx_liver_user_date` (`user_id`,`screening_date`),
    ADD INDEX IF NOT EXISTS `idx_liver_profile` (`care_profile_id`);

ALTER TABLE `goal_progress`
    ADD INDEX IF NOT EXISTS `idx_goal_id` (`goal_id`),
    ADD INDEX IF NOT EXISTS `idx_progress_date` (`progress_date`);

ALTER TABLE `health_assessments`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_assessment_date` (`assessment_date`),
    ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`),
    ADD INDEX IF NOT EXISTS `idx_assessment_risk` (`user_id`,`risk_category`),
    ADD INDEX IF NOT EXISTS `idx_assessments_care_profile` (`care_profile_id`);

ALTER TABLE `health_history`
    ADD UNIQUE INDEX IF NOT EXISTS `unique_profile_date` (`care_profile_id`,`tracking_date`),
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_tracking_date` (`tracking_date`),
    ADD INDEX IF NOT EXISTS `idx_user_health_latest` (`user_id`,`tracking_date`),
    ADD INDEX IF NOT EXISTS `idx_history_care_profile` (`care_profile_id`);

ALTER TABLE `health_predictions`
    ADD UNIQUE INDEX IF NOT EXISTS `assessment_id` (`assessment_id`),
    ADD INDEX IF NOT EXISTS `idx_assessment_id` (`assessment_id`),
    ADD INDEX IF NOT EXISTS `idx_risk_level` (`risk_level`);

ALTER TABLE `hydration_logs`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_hydration_date` (`hydration_date`),
    ADD INDEX IF NOT EXISTS `idx_hydration_care_profile` (`care_profile_id`);

ALTER TABLE `medicines`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_is_active` (`is_active`),
    ADD INDEX IF NOT EXISTS `idx_start_date` (`start_date`),
    ADD INDEX IF NOT EXISTS `idx_user_medicines_active` (`user_id`,`is_active`,`start_date`),
    ADD INDEX IF NOT EXISTS `idx_medicines_care_profile` (`care_profile_id`);

ALTER TABLE `medicine_intake_logs`
    ADD UNIQUE INDEX IF NOT EXISTS `unique_medicine_log` (`medicine_id`,`log_date`),
    ADD INDEX IF NOT EXISTS `idx_medicine_id` (`medicine_id`),
    ADD INDEX IF NOT EXISTS `idx_log_date` (`log_date`);

ALTER TABLE `medicine_schedules`
    ADD UNIQUE INDEX IF NOT EXISTS `unique_medicine_schedule` (`medicine_id`,`scheduled_date`,`scheduled_time`),
    ADD INDEX IF NOT EXISTS `idx_medicine_id` (`medicine_id`),
    ADD INDEX IF NOT EXISTS `idx_scheduled_date` (`scheduled_date`),
    ADD INDEX IF NOT EXISTS `idx_medicine_adherence` (`medicine_id`,`scheduled_date`);

ALTER TABLE `menstrual_logs`
    ADD INDEX IF NOT EXISTS `idx_menstrual_user_date` (`user_id`,`period_start_date`),
    ADD INDEX IF NOT EXISTS `idx_menstrual_profile` (`care_profile_id`);

ALTER TABLE `ml_model_info`
    ADD INDEX IF NOT EXISTS `idx_model_version` (`model_version`),
    ADD INDEX IF NOT EXISTS `idx_is_active` (`is_active`);

ALTER TABLE `notifications`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_is_read` (`is_read`),
    ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`),
    ADD INDEX IF NOT EXISTS `idx_notification_unread` (`user_id`,`is_read`,`created_at`);

ALTER TABLE `nutrition_logs`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_nutrition_date` (`nutrition_date`),
    ADD INDEX IF NOT EXISTS `idx_nutrition_care_profile` (`care_profile_id`);

ALTER TABLE `pcos_screenings`
    ADD INDEX IF NOT EXISTS `idx_pcos_user` (`user_id`,`screening_date`),
    ADD INDEX IF NOT EXISTS `idx_pcos_profile` (`care_profile_id`);

ALTER TABLE `sleep_logs`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_sleep_date` (`sleep_date`),
    ADD INDEX IF NOT EXISTS `idx_user_sleep_weekly` (`user_id`,`sleep_date`),
    ADD INDEX IF NOT EXISTS `idx_sleep_care_profile` (`care_profile_id`);

ALTER TABLE `symptom_logs`
    ADD INDEX IF NOT EXISTS `idx_symptom_user_date` (`user_id`,`logged_at`),
    ADD INDEX IF NOT EXISTS `idx_symptoms_care_profile` (`care_profile_id`);

ALTER TABLE `token_blocklist`
    ADD UNIQUE INDEX IF NOT EXISTS `jti` (`jti`),
    ADD INDEX IF NOT EXISTS `idx_jti` (`jti`),
    ADD INDEX IF NOT EXISTS `idx_expires_at` (`expires_at`);

ALTER TABLE `users`
    ADD UNIQUE INDEX IF NOT EXISTS `email` (`email`),
    ADD INDEX IF NOT EXISTS `idx_email` (`email`),
    ADD INDEX IF NOT EXISTS `idx_role` (`role`),
    ADD INDEX IF NOT EXISTS `idx_created_at` (`created_at`),
    ADD INDEX IF NOT EXISTS `idx_users_active` (`role`,`is_active`);

ALTER TABLE `user_device_tokens`
    ADD UNIQUE INDEX IF NOT EXISTS `unique_user_push_token` (`user_id`,`push_token`),
    ADD INDEX IF NOT EXISTS `idx_user_devices` (`user_id`,`is_active`);

ALTER TABLE `user_profiles`
    ADD UNIQUE INDEX IF NOT EXISTS `user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`);

ALTER TABLE `user_tokens`
    ADD UNIQUE INDEX IF NOT EXISTS `uq_token_hash` (`token_hash`),
    ADD INDEX IF NOT EXISTS `idx_user_token_type` (`user_id`,`token_type`);

ALTER TABLE `weekly_reports`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_week_start_date` (`week_start_date`),
    ADD INDEX IF NOT EXISTS `idx_weekly_report_user` (`user_id`,`week_start_date`),
    ADD INDEX IF NOT EXISTS `idx_reports_care_profile` (`care_profile_id`);

ALTER TABLE `wellness_goals`
    ADD INDEX IF NOT EXISTS `idx_user_id` (`user_id`),
    ADD INDEX IF NOT EXISTS `idx_status` (`status`),
    ADD INDEX IF NOT EXISTS `idx_goals_care_profile` (`care_profile_id`);


-- ============================================================================
-- PART 7: Add foreign keys that are missing (a column that already has a foreign key is skipped)
-- ============================================================================
DROP PROCEDURE IF EXISTS hp_add_fk;
DELIMITER $$
CREATE PROCEDURE hp_add_fk(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_ref_tbl VARCHAR(64), IN p_ref_col VARCHAR(64), IN p_del VARCHAR(20), IN p_upd VARCHAR(20))
BEGIN
  -- Adds a foreign key only if the column has no foreign key yet (matched by column, not by name).
  IF (SELECT COUNT(*) FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND table_name = p_tbl AND column_name = p_col
         AND referenced_table_name IS NOT NULL) = 0 THEN
    SET @hp_sql = CONCAT('ALTER TABLE `', p_tbl, '` ADD CONSTRAINT `fk_', LEFT(p_tbl, 28), '_', LEFT(p_col, 28),
        '` FOREIGN KEY (`', p_col, '`) REFERENCES `', p_ref_tbl, '` (`', p_ref_col, '`)',
        IF(p_del <> '', CONCAT(' ON DELETE ', p_del), ''), IF(p_upd <> '', CONCAT(' ON UPDATE ', p_upd), ''));
    PREPARE hp_stmt FROM @hp_sql; EXECUTE hp_stmt; DEALLOCATE PREPARE hp_stmt;
  END IF;
END$$
DELIMITER ;

CALL hp_add_fk('admin_audit_logs','admin_id','users','id','CASCADE','');
CALL hp_add_fk('caregiver_access','account_owner_id','users','id','CASCADE','');
CALL hp_add_fk('caregiver_access','caregiver_user_id','users','id','SET NULL','');
CALL hp_add_fk('care_profiles','account_owner_id','users','id','CASCADE','');
CALL hp_add_fk('diabetes_screenings','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('diabetes_screenings','user_id','users','id','CASCADE','');
CALL hp_add_fk('doctor_appointments','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('doctor_appointments','user_id','users','id','CASCADE','');
CALL hp_add_fk('doctor_shares','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('doctor_shares','user_id','users','id','CASCADE','');
CALL hp_add_fk('doctor_share_notes','doctor_share_id','doctor_shares','id','CASCADE','');
CALL hp_add_fk('emergency_cards','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('emergency_cards','user_id','users','id','CASCADE','');
CALL hp_add_fk('exercise_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('exercise_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('fatty_liver_screenings','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('fatty_liver_screenings','user_id','users','id','CASCADE','');
CALL hp_add_fk('goal_progress','goal_id','wellness_goals','id','CASCADE','');
CALL hp_add_fk('health_assessments','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('health_assessments','user_id','users','id','CASCADE','');
CALL hp_add_fk('health_history','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('health_history','user_id','users','id','CASCADE','');
CALL hp_add_fk('health_predictions','assessment_id','health_assessments','id','CASCADE','');
CALL hp_add_fk('hydration_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('hydration_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('medicines','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('medicines','user_id','users','id','CASCADE','');
CALL hp_add_fk('medicine_intake_logs','medicine_id','medicines','id','CASCADE','');
CALL hp_add_fk('medicine_schedules','medicine_id','medicines','id','CASCADE','');
CALL hp_add_fk('menstrual_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('menstrual_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('notifications','user_id','users','id','CASCADE','');
CALL hp_add_fk('nutrition_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('nutrition_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('pcos_screenings','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('pcos_screenings','user_id','users','id','CASCADE','');
CALL hp_add_fk('sleep_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('sleep_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('symptom_logs','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('symptom_logs','user_id','users','id','CASCADE','');
CALL hp_add_fk('user_device_tokens','user_id','users','id','CASCADE','');
CALL hp_add_fk('user_profiles','user_id','users','id','CASCADE','');
CALL hp_add_fk('user_tokens','user_id','users','id','CASCADE','');
CALL hp_add_fk('weekly_reports','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('weekly_reports','user_id','users','id','CASCADE','');
CALL hp_add_fk('wellness_goals','care_profile_id','care_profiles','id','CASCADE','');
CALL hp_add_fk('wellness_goals','user_id','users','id','CASCADE','');

DROP PROCEDURE IF EXISTS hp_add_fk;


-- ============================================================================
-- PART 8: Remove the two old UNIQUE indexes that block multiple care profiles (only if present)
-- ============================================================================
ALTER TABLE `health_history` DROP INDEX IF EXISTS `unique_user_date`;
ALTER TABLE `emergency_cards` DROP INDEX IF EXISTS `user_id`;


SET SQL_MODE=@OLD_SQL_MODE;
SET SQL_SAFE_UPDATES=@OLD_SAFE_UPDATES;
SET FOREIGN_KEY_CHECKS=1;

-- ============================================================================
-- PART 9: Result check (read-only): rows still missing a care profile. Expect every number to be 0.
-- ============================================================================
SELECT 'medicines' AS table_name, COUNT(*) AS rows_without_care_profile FROM `medicines` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'diabetes_screenings', COUNT(*) FROM `diabetes_screenings` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'doctor_appointments', COUNT(*) FROM `doctor_appointments` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'doctor_shares', COUNT(*) FROM `doctor_shares` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'emergency_cards', COUNT(*) FROM `emergency_cards` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'exercise_logs', COUNT(*) FROM `exercise_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'fatty_liver_screenings', COUNT(*) FROM `fatty_liver_screenings` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'health_assessments', COUNT(*) FROM `health_assessments` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'health_history', COUNT(*) FROM `health_history` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'hydration_logs', COUNT(*) FROM `hydration_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'menstrual_logs', COUNT(*) FROM `menstrual_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'nutrition_logs', COUNT(*) FROM `nutrition_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'pcos_screenings', COUNT(*) FROM `pcos_screenings` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'sleep_logs', COUNT(*) FROM `sleep_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'symptom_logs', COUNT(*) FROM `symptom_logs` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'weekly_reports', COUNT(*) FROM `weekly_reports` WHERE `care_profile_id` IS NULL
UNION ALL SELECT 'wellness_goals', COUNT(*) FROM `wellness_goals` WHERE `care_profile_id` IS NULL
;

