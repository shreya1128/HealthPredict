"""Unit tests for the translation layer and prediction logic. The translation-layer tests use
plain namespace objects (not the ORM/DB) since build_features only reads attributes - this keeps
them fast and DB-independent, matching the pattern used for health_score.py in Phase 3."""

import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import prediction_service as ps

ML_DIR = Path(__file__).resolve().parents[2] / "ml"


def profile(**overrides):
    base = dict(height_cm=170, weight_kg=72, bmi=24.9, cholesterol_level="NORMAL",
               smoking_status="NEVER", alcohol_consumption="NEVER", exercise_frequency="ACTIVE")
    base.update(overrides)
    return SimpleNamespace(**base)


def user(profile_obj="default", **overrides):
    base = dict(date_of_birth=date.today() - timedelta(days=365 * 40), gender="FEMALE")
    base.update(overrides)
    p = profile() if profile_obj == "default" else profile_obj
    return SimpleNamespace(profile=p, **base)


def assessment(**overrides):
    base = dict(systolic_bp=120, diastolic_bp=80, blood_glucose_mg_dl=90)
    base.update(overrides)
    return SimpleNamespace(**base)


class TestBuildFeaturesCompleteInput:
    def test_complete_profile_produces_all_14_features(self):
        features, missing = ps.build_features(user(), assessment())
        assert missing == []
        assert set(features) == set(ps.FEATURE_COLUMNS)

    def test_derived_values_are_correct(self):
        features, _ = ps.build_features(user(), assessment(systolic_bp=130, diastolic_bp=80))
        assert features["pulse_pressure"] == 50
        assert features["map_pressure"] == pytest.approx(80 + 50 / 3, abs=0.05)
        assert features["age_years"] == pytest.approx(40, abs=0.1)


class TestMissingFieldsReportedClearly:
    @pytest.mark.parametrize("field,value,expected_substring", [
        ("date_of_birth", None, "date of birth"),
        ("gender", None, "gender"),
    ])
    def test_missing_account_fields(self, field, value, expected_substring):
        u = user(**{field: value})
        features, missing = ps.build_features(u, assessment())
        assert features is None
        assert any(expected_substring in m for m in missing)

    @pytest.mark.parametrize("field,expected_substring", [
        ("height_cm", "height and weight"), ("weight_kg", "height and weight"),
        ("cholesterol_level", "cholesterol"), ("smoking_status", "smoking"),
        ("alcohol_consumption", "alcohol"), ("exercise_frequency", "exercise"),
    ])
    def test_missing_profile_fields(self, field, expected_substring):
        u = user(profile(**{field: None}))
        features, missing = ps.build_features(u, assessment())
        assert features is None
        assert any(expected_substring in m for m in missing)

    def test_no_profile_at_all(self):
        u = user(profile_obj=None)
        features, missing = ps.build_features(u, assessment())
        assert features is None
        assert len(missing) >= 5  # every profile-sourced field should be flagged

    def test_missing_blood_pressure_in_assessment(self):
        features, missing = ps.build_features(user(), assessment(systolic_bp=None, diastolic_bp=None))
        assert features is None
        assert any("blood pressure" in m for m in missing)

    def test_missing_glucose_in_assessment(self):
        features, missing = ps.build_features(user(), assessment(blood_glucose_mg_dl=None))
        assert features is None
        assert any("glucose" in m for m in missing)

    def test_multiple_missing_fields_all_reported_at_once(self):
        u = user(profile(height_cm=None, smoking_status=None))
        features, missing = ps.build_features(u, assessment(blood_glucose_mg_dl=None))
        assert features is None
        assert len(missing) == 3  # not just the first one found


class TestEncodingMappings:
    @pytest.mark.parametrize("gender,expected", [("FEMALE", 0), ("MALE", 1)])
    def test_gender(self, gender, expected):
        features, _ = ps.build_features(user(gender=gender), assessment())
        assert features["gender"] == expected

    def test_gender_other_ensemble_produces_ensemble_prediction(self):
        features, missing = ps.build_features(user(gender="OTHER"), assessment())
        assert missing == []
        assert features["gender"] == "ENSEMBLE"
        res = ps.predict(features)
        assert res is not None
        assert "inclusive demographic ensemble" in res["explanation_text"]

    @pytest.mark.parametrize("level,expected", [("NORMAL", 1), ("ABOVE_NORMAL", 2), ("WELL_ABOVE_NORMAL", 3)])
    def test_cholesterol(self, level, expected):
        features, _ = ps.build_features(user(profile(cholesterol_level=level)), assessment())
        assert features["cholesterol"] == expected

    @pytest.mark.parametrize("status,expected", [("NEVER", 0), ("FORMER", 0), ("CURRENT", 1)])
    def test_smoking(self, status, expected):
        features, _ = ps.build_features(user(profile(smoking_status=status)), assessment())
        assert features["smoke"] == expected

    @pytest.mark.parametrize("status,expected", [
        ("NEVER", 0), ("OCCASIONALLY", 0), ("REGULARLY", 1), ("HEAVILY", 1),
    ])
    def test_alcohol(self, status, expected):
        features, _ = ps.build_features(user(profile(alcohol_consumption=status)), assessment())
        assert features["alco"] == expected

    @pytest.mark.parametrize("freq,expected", [
        ("SEDENTARY", 0), ("LIGHT", 1), ("MODERATE", 1), ("ACTIVE", 1), ("VERY_ACTIVE", 1),
    ])
    def test_exercise(self, freq, expected):
        features, _ = ps.build_features(user(profile(exercise_frequency=freq)), assessment())
        assert features["active"] == expected

    @pytest.mark.parametrize("glucose,expected", [(60, 1), (99, 1), (100, 2), (125, 2), (126, 3), (300, 3)])
    def test_glucose_bands_match_phase3_ada_thresholds(self, glucose, expected):
        features, _ = ps.build_features(user(), assessment(blood_glucose_mg_dl=glucose))
        assert features["gluc"] == expected


class TestClassifyRisk:
    def test_thresholds(self):
        assert ps.classify_risk(0.34) == "LOW"
        assert ps.classify_risk(0.35) == "MODERATE"
        assert ps.classify_risk(0.64) == "MODERATE"
        assert ps.classify_risk(0.65) == "HIGH"


class TestFeatureColumnsConsistencyWithTrainingConfig:
    """Guards against the backend's duplicated FEATURE_COLUMNS silently drifting from the actual
    training config - imports ml/config.py directly, only inside this test, so production code
    stays fully decoupled (see prediction_service.py's module docstring)."""

    def test_matches_ml_config_exactly(self):
        if not ML_DIR.exists():
            pytest.skip("ml/ directory not present in this checkout")
        sys.path.insert(0, str(ML_DIR))
        try:
            import config as ml_config
            assert ps.FEATURE_COLUMNS == ml_config.FEATURE_COLUMNS
        finally:
            sys.path.remove(str(ML_DIR))
            sys.modules.pop("config", None)  # don't leak the generic name into later tests


class TestPredictAgainstRealModel:
    """These hit the actual saved model artifact (ml/saved_models/best_model.joblib) -
    skipped automatically if it doesn't exist, rather than failing the whole suite."""

    @staticmethod
    @pytest.fixture(autouse=True, scope="class")
    def _require_model():
        if not ps.ML_MODEL_PATH.exists():
            pytest.skip("No trained model at ml/saved_models/best_model.joblib - "
                       "run ml/training/train.py first")

    def complete_features(self, **overrides):
        base = dict(age_years=45, height_cm=170, weight_kg=72, bmi=24.9, ap_hi=120, ap_lo=80,
                   pulse_pressure=40, map_pressure=93.3, gender=0, cholesterol=1, gluc=1,
                   smoke=0, alco=0, active=1)
        base.update(overrides)
        return base

    def test_output_shape(self):
        result = ps.predict(self.complete_features())
        assert result is not None
        assert 0.0 <= result["probability"] <= 1.0
        assert result["risk_level"] in {"LOW", "MODERATE", "HIGH"}
        assert 0.0 <= result["confidence_percent"] <= 100.0
        assert len(result["top_factors"]) == ps.TOP_FACTORS_COUNT
        assert all(f["direction"] in {"increases", "decreases"} for f in result["top_factors"])
        assert "not a medical diagnosis" in result["disclaimer"]

    def test_deterministic(self):
        a = ps.predict(self.complete_features())
        b = ps.predict(self.complete_features())
        assert a == b

    def test_low_and_high_risk_profiles_separate(self):
        low = ps.predict(self.complete_features(age_years=30, ap_hi=110, ap_lo=70, cholesterol=1,
                                                 gluc=1, smoke=0, active=1))
        high = ps.predict(self.complete_features(age_years=62, ap_hi=175, ap_lo=105, cholesterol=3,
                                                  gluc=3, smoke=1, active=0))
        assert low["probability"] < high["probability"]
        assert low["risk_level"] == "LOW" and high["risk_level"] == "HIGH"

    def test_top_factors_ranked_by_descending_relative_strength(self):
        result = ps.predict(self.complete_features())
        strengths = [f["relative_strength"] for f in result["top_factors"]]
        assert strengths == sorted(strengths, reverse=True)
        assert strengths[0] == 100.0  # the strongest factor is the normalization anchor

    def test_blood_pressure_is_the_dominant_factor_for_a_high_bp_profile(self):
        """Matches docs/ml-methodology.md's documented global importance (ap_hi dominant)."""
        result = ps.predict(self.complete_features(ap_hi=185, ap_lo=115))
        assert result["top_factors"][0]["key"] == "ap_hi"
        assert result["top_factors"][0]["direction"] == "increases"


def test_predict_returns_none_without_a_trained_model(monkeypatch):
    """Simulates the model-not-yet-trained case without touching the real singleton used by
    other tests."""
    monkeypatch.setattr(ps, "_bundle", None)
    monkeypatch.setattr(ps, "ML_MODEL_PATH", Path("/nonexistent/model.joblib"))
    try:
        assert ps.predict({c: 0 for c in ps.FEATURE_COLUMNS}) is None
    finally:
        monkeypatch.setattr(ps, "_bundle", None)  # force the real bundle to reload next time


class TestClinicalGuidance:
    def test_clinical_guidance_screening_demarcation(self):
        guidance = ps.get_clinical_guidance("HIGH", systolic_bp=160)
        assert "Statistical Screening vs. Clinical Diagnosis" in guidance["screening_vs_diagnosis"]
        assert len(guidance["recommended_doctor_discussions"]) >= 3
        assert any("electrocardiogram" in d.lower() or "ecg" in d.lower() for d in guidance["recommended_doctor_discussions"])

    def test_clinical_guidance_low_risk(self):
        guidance = ps.get_clinical_guidance("LOW", systolic_bp=115)
        assert any("routine annual" in d.lower() for d in guidance["recommended_doctor_discussions"])

