-- Migration 005: Scheduling Cadences, Dosage Snapshots & Goal Historical Progress
-- Supports complex weekly/monthly cadences, dosage history snapshots, baseline weight goals, and goal progress tracking

ALTER TABLE `medicines`
    ADD COLUMN `weekdays` JSON NULL,
    ADD COLUMN `month_day` SMALLINT NULL;

ALTER TABLE `medicine_schedules`
    ADD COLUMN `dosage_at_intake` DECIMAL(10, 2) NULL,
    ADD COLUMN `dosage_unit_at_intake` VARCHAR(50) NULL;

ALTER TABLE `wellness_goals`
    ADD COLUMN `baseline_value` DECIMAL(10, 2) NULL,
    ADD COLUMN `manual_percentage` DECIMAL(5, 2) NULL;

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
