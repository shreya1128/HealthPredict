-- Migration 014: Fatty Liver Risk Awareness Screenings Table
-- Educational awareness tool based on metabolic dysfunction-associated steatotic liver disease (MASLD / NAFLD) risk factors.
-- Strictly educational risk assessment - not a clinical or predictive diagnosis.

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
