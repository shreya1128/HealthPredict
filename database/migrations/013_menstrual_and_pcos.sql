-- Migration 013: Menstrual Cycle Tracking and PCOS Educational Screening
-- User-controlled cycle tracking, period history, flow & symptoms, and decoupled educational PCOS screening.

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
