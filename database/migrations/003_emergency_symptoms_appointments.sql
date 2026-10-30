-- Migration 003: Emergency Medical ID Card & Symptoms Diary & Appointments
-- Supports emergency lock-screen cards, symptom logs, and appointment preparation.

CREATE TABLE IF NOT EXISTS `emergency_cards` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT UNIQUE NOT NULL,
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
    `is_public` BOOLEAN DEFAULT TRUE,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_emer_token` (`public_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `symptom_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `symptom_name` VARCHAR(255) NOT NULL,
    `severity` INT NOT NULL, -- 1 (Mild) to 5 (Severe)
    `logged_at` DATETIME NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_symptom_user_date` (`user_id`, `logged_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `doctor_appointments` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `doctor_name` VARCHAR(255) NOT NULL,
    `specialty` VARCHAR(100) NULL,
    `location` VARCHAR(255) NULL,
    `appointment_date` DATETIME NOT NULL,
    `reason_for_visit` VARCHAR(255) NULL,
    `questions_to_ask` JSON NULL,
    `status` ENUM('UPCOMING', 'COMPLETED', 'CANCELLED') DEFAULT 'UPCOMING',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_appts_user_date` (`user_id`, `appointment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
