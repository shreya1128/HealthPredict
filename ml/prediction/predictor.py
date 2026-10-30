"""Loads the saved model pipeline and exposes a simple predict() interface.

This module is dataset-facing: predict() expects a dict with exactly the FEATURE_COLUMNS the
model was trained on (config.py), using the dataset's own encodings (e.g. gender 0=female/
1=male, cholesterol 1/2/3 ordinal). Translating the live app's schema (health_assessments,
user_profiles) into this feature dict - including resolving the cholesterol gap noted in
docs/ml-methodology.md - is Phase 5's job, not this module's.
"""

from pathlib import Path

import joblib
import pandas as pd

from config import BEST_MODEL_PATH, FEATURE_COLUMNS

# Risk categories share LOW/MODERATE/HIGH labels and thresholds with the Phase 3 rule-based
# score (app/utils/health_score.py) for a consistent vocabulary across the app - they remain two
# independently-computed numbers from two different methods; see docs/ml-methodology.md.
LOW_THRESHOLD = 0.35
HIGH_THRESHOLD = 0.65


def classify_risk(probability: float) -> str:
    if probability < LOW_THRESHOLD:
        return "LOW"
    if probability < HIGH_THRESHOLD:
        return "MODERATE"
    return "HIGH"


class HealthRiskPredictor:
    def __init__(self, model_path: Path = BEST_MODEL_PATH):
        if not Path(model_path).exists():
            raise FileNotFoundError(
                f"No trained model at {model_path}. Run training/train.py first.")
        self.pipeline = joblib.load(model_path)

    def predict(self, features: dict) -> dict:
        """features: dict with all of FEATURE_COLUMNS present. Raises KeyError listing any
        missing ones (fails loudly rather than silently imputing)."""
        missing = [c for c in FEATURE_COLUMNS if c not in features]
        if missing:
            raise KeyError(f"Missing required feature(s): {missing}")
        row = pd.DataFrame([{c: features[c] for c in FEATURE_COLUMNS}])
        probability = float(self.pipeline.predict_proba(row)[0, 1])
        return {
            "probability": round(probability, 4),
            "risk_level": classify_risk(probability),
            "model_name": type(self.pipeline.named_steps["model"]).__name__,
        }
