-- Migration 007: Medicine Intelligence & Refill Tracking
-- Adds RxNorm rxcui and supply tracking columns to medicines
-- Adds persistent caching table for drug-drug interactions

ALTER TABLE `medicines`
    ADD COLUMN `rxcui` VARCHAR(50) NULL,
    ADD COLUMN `quantity_on_hand` INT NULL,
    ADD COLUMN `pills_per_dose` INT DEFAULT 1,
    ADD COLUMN `refill_threshold_days` INT DEFAULT 7,
    ADD COLUMN `pharmacy_note` TEXT NULL;

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
