-- Migration 002: Add Doctor Summary Shares Table
-- Supports secure, revocable token links (/s/<token>) allowing doctors to view a patient summary without an account.

CREATE TABLE IF NOT EXISTS `doctor_shares` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token` CHAR(64) UNIQUE NOT NULL,
    `days_range` INT DEFAULT 30,
    `questions_for_doctor` JSON NULL,
    `expires_at` DATETIME NOT NULL,
    `is_revoked` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_docshare_token` (`token`),
    INDEX `idx_docshare_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
