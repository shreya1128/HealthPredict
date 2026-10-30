"""Tests against the REAL saved model artifact (not a mock) - this is the actual verification
that training produced a usable, sane model, not just that the training script ran without error.
"""

import pytest

from config import BEST_MODEL_PATH, FEATURE_COLUMNS
from prediction.predictor import HealthRiskPredictor, classify_risk

pytestmark = pytest.mark.skipif(
    not BEST_MODEL_PATH.exists(), reason="No trained model yet - run training/train.py first")


def base_profile(**overrides):
    p = dict(age_years=45, height_cm=170, weight_kg=72, bmi=24.9, ap_hi=120, ap_lo=80,
            pulse_pressure=40, map_pressure=93.3, gender=0, cholesterol=1, gluc=1,
            smoke=0, alco=0, active=1)
    p.update(overrides)
    return p


class TestClassifyRisk:
    def test_thresholds(self):
        assert classify_risk(0.0) == "LOW"
        assert classify_risk(0.34) == "LOW"
        assert classify_risk(0.35) == "MODERATE"
        assert classify_risk(0.64) == "MODERATE"
        assert classify_risk(0.65) == "HIGH"
        assert classify_risk(1.0) == "HIGH"


class TestHealthRiskPredictor:
    @staticmethod
    @pytest.fixture(scope="class")
    def predictor():
        return HealthRiskPredictor()

    def test_missing_feature_raises_rather_than_guessing(self, predictor):
        incomplete = base_profile()
        del incomplete["bmi"]
        with pytest.raises(KeyError, match="bmi"):
            predictor.predict(incomplete)

    def test_output_shape(self, predictor):
        out = predictor.predict(base_profile())
        assert set(out) == {"probability", "risk_level", "model_name"}
        assert 0.0 <= out["probability"] <= 1.0
        assert out["risk_level"] in {"LOW", "MODERATE", "HIGH"}

    def test_obviously_low_and_high_risk_profiles_separate_correctly(self, predictor):
        low = predictor.predict(base_profile(age_years=30, ap_hi=110, ap_lo=70, cholesterol=1,
                                              gluc=1, smoke=0, active=1))
        high = predictor.predict(base_profile(age_years=62, ap_hi=175, ap_lo=105, cholesterol=3,
                                              gluc=3, smoke=1, active=0))
        assert low["probability"] < high["probability"]
        assert low["risk_level"] == "LOW"
        assert high["risk_level"] == "HIGH"

    def test_risk_increases_monotonically_with_blood_pressure(self, predictor):
        """The model's #1 feature by importance (0.686) - risk must not decrease as it
        worsens, holding everything else fixed."""
        probs = [predictor.predict(base_profile(ap_hi=v, ap_lo=min(v - 30, 100)))["probability"]
                for v in [110, 130, 150, 170]]
        assert probs == sorted(probs)

    def test_age_increases_risk_holding_everything_else_fixed(self, predictor):
        probs = [predictor.predict(base_profile(age_years=age))["probability"] for age in [30, 40, 50, 60]]
        assert probs == sorted(probs)

    def test_deterministic_for_the_same_input(self, predictor):
        a = predictor.predict(base_profile())
        b = predictor.predict(base_profile())
        assert a == b

    def test_missing_model_file_raises_clear_error(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="training/train.py"):
            HealthRiskPredictor(model_path=tmp_path / "nope.joblib")
