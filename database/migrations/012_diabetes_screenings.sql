-- Migration 012: Diabetes Risk Screenings Table
-- Provides dedicated, versioned storage for validated non-invasive diabetes risk screenings (ADA / FINDRISC standard).
-- Decoupled from cardiovascular machine learning assessments.

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
