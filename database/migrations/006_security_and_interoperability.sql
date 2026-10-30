-- Migration 006: Security Architecture & Clinical Interoperability
-- Supports token revocation blacklisting, physician write-back notes on shared summaries

CREATE TABLE IF NOT EXISTS `token_blocklist` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `jti` VARCHAR(64) UNIQUE NOT NULL,
    `user_id` BIGINT NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_jti (`jti`),
    INDEX idx_expires_at (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `doctor_shares`
    ADD COLUMN `doctor_name` VARCHAR(255) NULL,
    ADD COLUMN `doctor_notes` TEXT NULL,
    ADD COLUMN `doctor_reviewed_at` DATETIME NULL,
    ADD COLUMN `doctor_recommendations` JSON NULL;
