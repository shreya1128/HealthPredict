-- Migration 009: Account Security, Sessions, and Doctor Share Notes
-- Adds TOTP fields to users, session metadata to user_tokens, and append-only doctor_share_notes table.

ALTER TABLE `users` 
    ADD COLUMN `totp_secret` VARCHAR(64) NULL AFTER `email_verified`,
    ADD COLUMN `totp_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `totp_secret`;

ALTER TABLE `user_tokens` 
    MODIFY COLUMN `token_type` ENUM('REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFY', 'TOTP_LOGIN', 'EMAIL_CHANGE') NOT NULL,
    ADD COLUMN `ip_address` VARCHAR(45) NULL AFTER `revoked`,
    ADD COLUMN `user_agent` VARCHAR(500) NULL AFTER `ip_address`,
    ADD COLUMN `device_name` VARCHAR(100) NULL AFTER `user_agent`;

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
