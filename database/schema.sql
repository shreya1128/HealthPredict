-- HealthPredict Database Schema
-- Complete database structure for healthcare prediction system
-- MySQL 8.0+

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- USERS & AUTHENTICATION
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
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
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

-- ============================================================================
-- USER PROFILES
-- ============================================================================

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

-- ============================================================================
-- AUTH TOKENS (refresh / password reset / email verification)
-- Only a SHA-256 hash of each token is stored, never the raw token.
-- ============================================================================

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

-- ============================================================================
-- HEALTH ASSESSMENTS & PREDICTIONS
-- ============================================================================

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

-- ============================================================================
-- HEALTH HISTORY & TRACKING
-- ============================================================================

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

-- ============================================================================
-- MEDICINES & MEDICATION TRACKING
-- ============================================================================

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

-- ============================================================================
-- WELLNESS TRACKING
-- ============================================================================

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

-- ============================================================================
-- WELLNESS GOALS & PROGRESS
-- ============================================================================

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

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

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

-- ============================================================================
-- REPORTS
-- ============================================================================

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

-- ============================================================================
-- ADMIN & AUDIT LOGGING
-- ============================================================================

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

-- ============================================================================
-- CARE PROFILES & CAREGIVERS
-- ============================================================================

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

CREATE TABLE IF NOT EXISTS caregiver_access (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_owner_id BIGINT NOT NULL,
    care_profile_id BIGINT NULL,
    caregiver_email VARCHAR(255) NOT NULL,
    access_level ENUM('VIEW_ONLY', 'EDIT') DEFAULT 'VIEW_ONLY',
    invite_token CHAR(64) UNIQUE NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'REVOKED') DEFAULT 'PENDING',
    notify_missed_dose BOOLEAN DEFAULT TRUE,
    caregiver_user_id BIGINT NULL,
    email_delivered BOOLEAN DEFAULT FALSE,
    email_delivery_status VARCHAR(50) DEFAULT 'QUEUED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    accepted_at DATETIME NULL,
    FOREIGN KEY (account_owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (care_profile_id) REFERENCES care_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (caregiver_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_caregiver_owner (account_owner_id),
    INDEX idx_caregiver_profile (care_profile_id),
    INDEX idx_caregiver_email (caregiver_email),
    INDEX idx_caregiver_user_id (caregiver_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CLINICAL SHARING & DOCTOR SUMMARIES
-- ============================================================================

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

-- ============================================================================
-- EMERGENCY MEDICAL ID, SYMPTOMS & APPOINTMENTS
-- ============================================================================

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
    `expires_at` DATETIME NULL,
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

-- ============================================================================
-- DEVICE PUSH TOKENS & SECURITY BLOCKLIST
-- ============================================================================

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

-- ============================================================================
-- ML MODEL METADATA
-- ============================================================================

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

-- ============================================================================
-- SET FOREIGN KEY CHECKS BACK ON
-- ============================================================================

-- ============================================================================
-- DIABETES RISK SCREENINGS (migration 012)
-- ============================================================================

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

-- ============================================================================
-- MENSTRUAL TRACKING AND PCOS SCREENING (migration 013)
-- ============================================================================

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

-- ============================================================================
-- FATTY LIVER AWARENESS SCREENINGS (migration 014)
-- ============================================================================

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

SET FOREIGN_KEY_CHECKS=1;

-- ============================================================================
-- VIEWS (OPTIONAL - for common queries)
-- ============================================================================

CREATE OR REPLACE VIEW user_health_summary AS
SELECT 
    u.id,
    u.full_name,
    u.email,
    up.weight_kg,
    up.bmi,
    hh.health_score,
    hh.tracking_date,
    COUNT(DISTINCT ha.id) as total_assessments,
    COUNT(DISTINCT med.id) as active_medicines
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN health_history hh ON u.id = hh.user_id AND hh.tracking_date = CURDATE()
LEFT JOIN health_assessments ha ON u.id = ha.user_id
LEFT JOIN medicines med ON u.id = med.user_id AND med.is_active = TRUE
WHERE u.role = 'USER'
GROUP BY u.id, u.full_name, u.email, up.weight_kg, up.bmi, hh.health_score, hh.tracking_date;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
