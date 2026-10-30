"""ML-based cardiovascular risk prediction (Phase 4/5), with SHAP explainability.

This is a SEPARATE, independently-computed number from the Phase 3 rule-based Health Score
(app/utils/health_score.py) - the two must never be presented as if they were the same thing.
Methodology, dataset, and model-comparison results: docs/ml-methodology.md.

Design: decoupled from ml/'s Python package (see config/ml_settings.py) - this module loads the
saved joblib Pipeline directly and duplicates the small, stable constants it needs (feature list,
risk thresholds). A test (tests/test_prediction_service.py) checks these haven't drifted from
ml/config.py's own copy.

Unlike the rule-based score, this model does NOT degrade gracefully with partial data: it is a
fixed-input classifier trained on exactly 14 features, and there is no principled way to drop one
and rescale (unlike a weighted-average score). So prediction is all-or-nothing: either every
required input is available from real, user-provided data, or no prediction is made at all -
never a guess standing in for a missing field.
"""

import json
import logging
from datetime import date
from typing import Optional

import joblib
import pandas as pd
import shap

from app.config.ml_settings import ML_MODEL_INFO_PATH, ML_MODEL_PATH
from app.models import HealthAssessment, HealthPrediction, User

logger = logging.getLogger(__name__)

# Must match ml/config.py's FEATURE_COLUMNS exactly, in this order - checked by
# tests/test_prediction_service.py against the actual training config, not just by eye.
FEATURE_COLUMNS = ["age_years", "height_cm", "weight_kg", "bmi", "ap_hi", "ap_lo",
                   "pulse_pressure", "map_pressure", "gender", "cholesterol", "gluc",
                   "smoke", "alco", "active"]

HUMAN_LABELS = {
    "age_years": "Age", "height_cm": "Height", "weight_kg": "Weight", "bmi": "BMI",
    "ap_hi": "Systolic blood pressure", "ap_lo": "Diastolic blood pressure",
    "pulse_pressure": "Pulse pressure", "map_pressure": "Mean arterial pressure",
    "gender": "Gender", "cholesterol": "Cholesterol level", "gluc": "Blood glucose level",
    "smoke": "Smoking status", "alco": "Alcohol consumption", "active": "Physical activity",
}

LOW_THRESHOLD = 0.35   # must match ml/prediction/predictor.py
HIGH_THRESHOLD = 0.65
TOP_FACTORS_COUNT = 5

DISCLAIMER = ("This prediction is a statistical association from a machine-learning model "
             "trained on a public dataset, not a medical diagnosis. The factors below show "
             "their relative influence on this specific prediction, not proof that any one of "
             "them caused the result. Consult a qualified healthcare professional for medical "
             "concerns.")


def classify_risk(probability: float) -> str:
    if probability < LOW_THRESHOLD:
        return "LOW"
    if probability < HIGH_THRESHOLD:
        return "MODERATE"
    return "HIGH"


class _ModelBundle:
    """Loaded once per process (model loading + building a TreeExplainer are not free, and
    both are safe to reuse across requests - sklearn Pipelines and shap.TreeExplainer are
    stateless with respect to .predict/.__call__)."""

    def __init__(self):
        self.available = ML_MODEL_PATH.exists()
        if not self.available:
            logger.warning("No trained model at %s - predictions will be unavailable until "
                           "ml/training/train.py has been run.", ML_MODEL_PATH)
            return
        self.pipeline = joblib.load(ML_MODEL_PATH)
        self.preprocess = self.pipeline.named_steps["preprocess"]
        self.model = self.pipeline.named_steps["model"]
        self.explainer = shap.TreeExplainer(self.model)
        info = json.loads(ML_MODEL_INFO_PATH.read_text()) if ML_MODEL_INFO_PATH.exists() else {}
        self.version = f"{info.get('model_name', 'unknown')}@{info.get('trained_at_utc', 'unknown')}"
        self.global_importance = dict(zip(FEATURE_COLUMNS, getattr(self.model, "feature_importances_", [])))


_bundle: Optional[_ModelBundle] = None


def _get_bundle() -> _ModelBundle:
    global _bundle
    if _bundle is None:
        _bundle = _ModelBundle()
    return _bundle


def is_model_loaded() -> bool:
    """Returns True if the ML model pipeline and artifacts were successfully loaded."""
    try:
        bundle = _get_bundle()
        return bool(bundle and bundle.available and hasattr(bundle, "pipeline"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Translation layer: live app data -> the model's exact training feature space.
# See docs/ml-methodology.md "Integration note for Phase 5" for why each mapping was chosen.
# ---------------------------------------------------------------------------

_SMOKE_CURRENT = {"CURRENT"}
_ALCOHOL_REGULAR_OR_MORE = {"REGULARLY", "HEAVILY"}
_ACTIVE_LEVELS = {"LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"}
_CHOLESTEROL_MAP = {"NORMAL": 1, "ABOVE_NORMAL": 2, "WELL_ABOVE_NORMAL": 3}
_GENDER_MAP = {"FEMALE": 0, "MALE": 1}


def get_clinical_guidance(risk_level: str, systolic_bp: Optional[int] = None) -> dict:
    """Returns structured clinical context and evidence-based physician discussion topics."""
    discussions = [
        "Review your overall cardiovascular screening indicators and lifestyle tracking data with your doctor.",
        "Discuss recommended intervals for blood pressure and metabolic monitoring.",
    ]
    if risk_level == "HIGH":
        discussions.insert(0, "Schedule an in-person clinical checkup to review resting and ambulatory blood pressure.")
        discussions.append("Ask if a comprehensive fasting lipid panel or HbA1c blood test is recommended.")
        discussions.append("Discuss whether a 12-lead electrocardiogram (ECG) or further cardiac evaluation is advised.")
    elif risk_level == "MODERATE":
        discussions.insert(0, "Discuss heart-healthy lifestyle optimizations (DASH/Mediterranean nutrition, aerobic activity).")
        discussions.append("Confirm target blood pressure thresholds for your age and background.")
    else:
        discussions.append("Continue current heart-healthy habits and maintain scheduled routine annual checkups.")

    return {
        "screening_vs_diagnosis": (
            "Statistical Screening vs. Clinical Diagnosis: This assessment provides statistical risk stratification "
            "derived from epidemiological health records. It identifies risk patterns but does NOT constitute a clinical "
            "diagnosis. Clinical diagnosis requires physician examination and confirmatory testing (e.g. ECG, bloodwork, imaging)."
        ),
        "recommended_doctor_discussions": discussions,
    }


def build_features(user: User, assessment: HealthAssessment) -> tuple[Optional[dict], list[str]]:
    """Returns (features, missing). features is None unless every required input was available
    from real data - missing then lists what to add, in user-facing language."""
    profile = user.profile
    missing: list[str] = []

    age_years = None
    if user.date_of_birth:
        age_years = (date.today() - user.date_of_birth).days / 365.25
    else:
        missing.append("date of birth")

    if user.gender == "OTHER":
        gender = "ENSEMBLE"
    elif user.gender in _GENDER_MAP:
        gender = _GENDER_MAP[user.gender]
    else:
        missing.append("gender in your profile")

    height_cm = profile.height_cm if profile else None
    weight_kg = profile.weight_kg if profile else None
    bmi = profile.bmi if profile else None
    if height_cm is None or weight_kg is None:
        missing.append("height and weight in your profile")

    if assessment.systolic_bp is None or assessment.diastolic_bp is None:
        missing.append("blood pressure in this assessment")

    cholesterol = _CHOLESTEROL_MAP.get(profile.cholesterol_level) if profile else None
    if cholesterol is None:
        missing.append("cholesterol level in your profile")

    gluc = None
    if assessment.blood_glucose_mg_dl is not None:
        g = assessment.blood_glucose_mg_dl
        gluc = 3 if g >= 126 else 2 if g >= 100 else 1
    else:
        missing.append("blood glucose in this assessment")

    smoke = alco = active = None
    if profile and profile.smoking_status:
        smoke = 1 if profile.smoking_status in _SMOKE_CURRENT else 0
    else:
        missing.append("smoking status in your profile")
    if profile and profile.alcohol_consumption:
        alco = 1 if profile.alcohol_consumption in _ALCOHOL_REGULAR_OR_MORE else 0
    else:
        missing.append("alcohol consumption in your profile")
    if profile and profile.exercise_frequency:
        active = 1 if profile.exercise_frequency in _ACTIVE_LEVELS else 0
    else:
        missing.append("exercise frequency in your profile")

    if missing:
        return None, missing

    pulse_pressure = assessment.systolic_bp - assessment.diastolic_bp
    map_pressure = assessment.diastolic_bp + pulse_pressure / 3
    features = {
        "age_years": round(age_years, 1), "height_cm": float(height_cm), "weight_kg": float(weight_kg),
        "bmi": float(bmi) if bmi is not None else None, "ap_hi": assessment.systolic_bp,
        "ap_lo": assessment.diastolic_bp, "pulse_pressure": pulse_pressure,
        "map_pressure": round(map_pressure, 1), "gender": gender, "cholesterol": cholesterol,
        "gluc": gluc, "smoke": smoke, "alco": alco, "active": active,
    }
    return features, []


def predict(features: dict) -> Optional[dict]:
    """Returns the full prediction+explanation dict, or None if no trained model is available
    (e.g. ml/training/train.py has not been run in this environment)."""
    bundle = _get_bundle()
    if not bundle.available:
        return None

    is_ensemble = features.get("gender") in ("ENSEMBLE", "OTHER", 0.5)

    if is_ensemble:
        # Demographic ensemble across biological baselines (Female = 0, Male = 1)
        row_f = pd.DataFrame([{c: (0 if c == "gender" else features[c]) for c in FEATURE_COLUMNS}])
        row_m = pd.DataFrame([{c: (1 if c == "gender" else features[c]) for c in FEATURE_COLUMNS}])
        trans_f = bundle.preprocess.transform(row_f)
        trans_m = bundle.preprocess.transform(row_m)
        prob_f = float(bundle.model.predict_proba(trans_f)[0, 1])
        prob_m = float(bundle.model.predict_proba(trans_m)[0, 1])
        probability = float((prob_f + prob_m) / 2.0)
        shap_f = bundle.explainer(trans_f).values[0]
        shap_m = bundle.explainer(trans_m).values[0]
        shap_row = (shap_f + shap_m) / 2.0
    else:
        row = pd.DataFrame([{c: features[c] for c in FEATURE_COLUMNS}])
        transformed = bundle.preprocess.transform(row)
        probability = float(bundle.model.predict_proba(transformed)[0, 1])
        shap_row = bundle.explainer(transformed).values[0]

    risk_level = classify_risk(probability)
    confidence_percent = round(abs(probability - 0.5) * 200, 1)

    # Ranked by |contribution| in the model's own log-odds space
    ranked = sorted(zip(FEATURE_COLUMNS, shap_row), key=lambda kv: -abs(kv[1]))
    max_abs = max(abs(v) for _, v in ranked) or 1.0
    top_factors = [
        {
            "key": key, "label": HUMAN_LABELS[key],
            "direction": "increases" if val > 0 else "decreases",
            "relative_strength": round(abs(val) / max_abs * 100, 1),
            "shap_value_log_odds": round(float(val), 4),
        }
        for key, val in ranked[:TOP_FACTORS_COUNT]
    ]

    top_label = top_factors[0]["label"].lower()
    if is_ensemble:
        explanation_text = (
            f"This prediction is computed using an inclusive demographic ensemble across biological baselines (Female & Male). "
            f"The primary risk influence is {top_label}, followed by {', '.join(f['label'].lower() for f in top_factors[1:3])}."
        )
    else:
        explanation_text = (
            f"This model's prediction is driven most by {top_label}, "
            f"followed by {', '.join(f['label'].lower() for f in top_factors[1:3])}."
        )

    clinical_info = get_clinical_guidance(risk_level, features.get("ap_hi"))

    return {
        "probability": round(probability, 4), "risk_level": risk_level,
        "confidence_percent": confidence_percent, "model_version": bundle.version,
        "global_feature_importance": {k: round(float(v), 4) for k, v in bundle.global_importance.items()},
        "top_factors": top_factors, "explanation_text": explanation_text, "disclaimer": DISCLAIMER,
        "clinical_context": clinical_info["screening_vs_diagnosis"],
        "recommended_discussions": clinical_info["recommended_doctor_discussions"],
    }


def create_prediction_for_assessment(db, user: User, assessment: HealthAssessment) -> tuple[Optional[HealthPrediction], list[str]]:
    """Computes and persists a HealthPrediction for a just-created assessment, if possible.

    Returns (prediction, missing) - exactly one of three outcomes:
      (HealthPrediction, [])  - success
      (None, [field, ...])    - the user's data is incomplete; these fields would unlock it
      (None, [])              - data was complete, but no trained model is available in this
                                environment (an operational issue, not a data-completeness one)
    Callers must check both values to tell the latter two apart.
    """
    features, missing = build_features(user, assessment)
    if missing:
        return None, missing

    result = predict(features)
    if result is None:
        return None, []  # no trained model available in this environment - not a data problem

    prediction = HealthPrediction(
        assessment_id=assessment.id, prediction_score=result["probability"],
        risk_level=result["risk_level"], confidence_percent=result["confidence_percent"],
        feature_importance=result["global_feature_importance"], model_version=result["model_version"],
        shap_values={f["key"]: f["shap_value_log_odds"] for f in result["top_factors"]},
        prediction_factors=result["top_factors"], explanation_text=result["explanation_text"],
    )
    db.add(prediction)
    db.flush()
    return prediction, []
