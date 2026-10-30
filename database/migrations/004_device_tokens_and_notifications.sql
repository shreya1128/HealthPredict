-- Migration 004: User Device Push Tokens for Remote Notifications (APNs / FCM / Expo Push)
CREATE TABLE IF NOT EXISTS `user_device_tokens` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `push_token` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(20) NOT NULL DEFAULT 'expo',
    `device_name` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_user_push_token` (`user_id`, `push_token`),
    INDEX `idx_user_devices` (`user_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
