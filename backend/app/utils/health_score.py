"""Rule-based wellness score (0-100).

This is NOT the ML model from Phase 4/5 (see health_predictions / app/services/prediction_service.py
once that exists). It is a transparent, deterministic scoring formula so the number on screen can
always be explained. It must never be confused with a diagnosis - see DISCLAIMER below.

Methodology (see docs/health-scoring.md for full references):

    Component        Weight   Inputs                          Reference
    ----------------- ------  ------------------------------  --------------------------------
    Cardiovascular      30%   blood pressure, resting HR       AHA blood-pressure categories
    Metabolic            25%   BMI, blood glucose                WHO BMI bands, ADA glucose bands
    Vitals                10%   SpO2, temperature                  WHO hypoxemia threshold
    Activity              15%   exercise frequency (profile)      WHO physical-activity guidance
    Sleep                  10%   sleep duration (profile)           CDC/NIH adult sleep guidance
    Substance use    10%   smoking, alcohol (profile)         General epidemiological consensus

If an input is missing, that component (or sub-part) is left out and the remaining weights are
rescaled proportionally so they still sum to 100 - the score is never padded with an invented value.
`data_completeness_percent` reports how much of the full weight was actually available, and
`low_confidence` is set when it drops below 50%, so the UI can warn the person the number is thin.

Hydration is intentionally excluded here: there is no reliable "today's intake" figure until the
Phase 7 hydration tracker exists (the profile only stores a goal, not what the user actually drank),
and inventing one would violate the "no hardcoded/fabricated values" rule.

Glucose has no fasting/random distinction in the current form, so its bands are deliberately
conservative and the API response always carries a caveat about this. Resting heart rate bands are
general-population defaults and do not account for athletes.

DISCLAIMER: this score is an educational wellness indicator, not a medical diagnosis.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from numbers import Real
from typing import Optional

Number = Optional[Real]

CARDIOVASCULAR_WEIGHT = 30
METABOLIC_WEIGHT = 25
VITALS_WEIGHT = 10
ACTIVITY_WEIGHT = 15
SLEEP_WEIGHT = 10
SUBSTANCE_WEIGHT = 10
TOTAL_WEIGHT = (CARDIOVASCULAR_WEIGHT + METABOLIC_WEIGHT + VITALS_WEIGHT
                + ACTIVITY_WEIGHT + SLEEP_WEIGHT + SUBSTANCE_WEIGHT)
assert TOTAL_WEIGHT == 100

LOW_CONFIDENCE_THRESHOLD = 50  # data_completeness_percent below this -> low_confidence=True

DISCLAIMER = ("The Health Score is an educational wellness indicator and is not a medical "
              "diagnosis. Consult a qualified healthcare professional for medical concerns.")


def _band(value: float, bands: list[tuple[float, float, int]], default: int = 50) -> int:
    """First (lo, hi, score) whose [lo, hi) contains value; bands must be sorted ascending."""
    for lo, hi, score in bands:
        if lo <= value < hi:
            return score
    return default


def _as_float(x: Number) -> Optional[float]:
    if x is None:
        return None
    return float(x)


# ---------------------------------------------------------------------------
# Individual measure -> 0-100 sub-score. Each is pure and independently testable.
# ---------------------------------------------------------------------------

def score_blood_pressure(systolic: Number, diastolic: Number) -> Optional[int]:
    """AHA categories; the more severe of the systolic/diastolic reading wins."""
    if systolic is None or diastolic is None:
        return None
    s, d = float(systolic), float(diastolic)
    if s >= 180 or d >= 120:
        return 15   # hypertensive crisis
    if s >= 140 or d >= 90:
        return 40   # stage 2
    if s >= 130 or d >= 80:
        return 65   # stage 1
    if s >= 120:
        return 85   # elevated
    if s < 90 or d < 60:
        return 70   # possible hypotension
    return 100      # normal: <120 systolic and <80 diastolic (and >=90/>=60)


def score_heart_rate(hr: Number) -> Optional[int]:
    v = _as_float(hr)
    if v is None:
        return None
    return _band(v, [
        (0, 40, 25), (40, 50, 50), (50, 60, 75),
        (60, 100.0001, 100), (100.0001, 111, 75), (111, 121, 50),
    ], default=25)


def score_bmi(bmi: Number) -> Optional[int]:
    v = _as_float(bmi)
    if v is None:
        return None
    return _band(v, [
        (0, 16, 15), (16, 17, 30), (17, 18.5, 55),
        (18.5, 25, 100), (25, 30, 70), (30, 35, 45), (35, 40, 25),
    ], default=15)


def score_glucose(glucose: Number) -> Optional[int]:
    v = _as_float(glucose)
    if v is None:
        return None
    return _band(v, [(0, 70, 50), (70, 100, 100), (100, 126, 65)], default=35)


def score_spo2(spo2: Number) -> Optional[int]:
    v = _as_float(spo2)
    if v is None:
        return None
    return _band(v, [(0, 90, 20), (90, 93, 50), (93, 95, 75)], default=100)


def score_temperature(temp_c: Number) -> Optional[int]:
    v = _as_float(temp_c)
    if v is None:
        return None
    if 36.1 <= v <= 37.2:
        return 100
    if (37.3 <= v <= 38.0) or (35.5 <= v < 36.1):
        return 70
    if (38.1 <= v <= 39.0) or v < 35.5:
        return 40
    return 15  # > 39.0


_EXERCISE_SCORES = {"SEDENTARY": 30, "LIGHT": 55, "MODERATE": 80, "ACTIVE": 95, "VERY_ACTIVE": 100}


def score_exercise_frequency(level: Optional[str]) -> Optional[int]:
    if not level:
        return None
    return _EXERCISE_SCORES.get(level.upper())


def score_sleep_duration(hours: Number) -> Optional[int]:
    v = _as_float(hours)
    if v is None:
        return None
    return _band(v, [
        (0, 4, 20), (4, 5, 50), (5, 6, 70), (6, 7, 85), (7, 9.0001, 100), (9.0001, 10, 70), (10, 11, 50),
    ], default=20)


_SMOKING_SCORES = {"NEVER": 100, "FORMER": 75, "CURRENT": 30}
_ALCOHOL_SCORES = {"NEVER": 100, "OCCASIONALLY": 90, "REGULARLY": 60, "HEAVILY": 25}


def score_smoking(status: Optional[str]) -> Optional[int]:
    return _SMOKING_SCORES.get(status.upper()) if status else None


def score_alcohol(status: Optional[str]) -> Optional[int]:
    return _ALCOHOL_SCORES.get(status.upper()) if status else None


# ---------------------------------------------------------------------------
# Assessment input and combination logic
# ---------------------------------------------------------------------------

@dataclass
class AssessmentInput:
    # Vitals - captured at assessment time
    systolic_bp: Number = None
    diastolic_bp: Number = None
    heart_rate_bpm: Number = None
    blood_glucose_mg_dl: Number = None
    spo2_percent: Number = None
    temperature_celsius: Number = None
    # Profile snapshot - read from the user's profile at assessment time
    bmi: Number = None
    exercise_frequency: Optional[str] = None
    sleep_duration_hours: Number = None
    smoking_status: Optional[str] = None
    alcohol_consumption: Optional[str] = None


@dataclass
class ComponentResult:
    key: str
    label: str
    score: Optional[int]        # None if excluded entirely
    weight_pct: float           # this component's share of the FINAL 100, after rescaling
    raw_weight_pct: float       # its share before rescaling (the numbers documented above)
    included: bool
    reason_excluded: Optional[str] = None


@dataclass
class ScoreResult:
    overall_score: float
    risk_category: str                      # LOW | MODERATE | HIGH (rule-based; see docstring)
    components: list[ComponentResult] = field(default_factory=list)
    data_completeness_percent: float = 0.0
    low_confidence: bool = False
    disclaimer: str = DISCLAIMER


def _combine(parts: list[tuple[Optional[int], float]]) -> Optional[float]:
    """Weighted average of (score, weight) pairs, skipping None scores. None if nothing usable."""
    usable = [(s, w) for s, w in parts if s is not None and w > 0]
    total_w = sum(w for _, w in usable)
    if total_w == 0:
        return None
    return sum(s * w for s, w in usable) / total_w


def compute_health_score(data: AssessmentInput) -> ScoreResult:
    cardio = _combine([(score_blood_pressure(data.systolic_bp, data.diastolic_bp), 0.6),
                       (score_heart_rate(data.heart_rate_bpm), 0.4)])
    metabolic = _combine([(score_bmi(data.bmi), 0.55), (score_glucose(data.blood_glucose_mg_dl), 0.45)])
    vitals = _combine([(score_spo2(data.spo2_percent), 0.6), (score_temperature(data.temperature_celsius), 0.4)])
    activity = score_exercise_frequency(data.exercise_frequency)
    sleep = score_sleep_duration(data.sleep_duration_hours)
    substance = _combine([(score_smoking(data.smoking_status), 0.6), (score_alcohol(data.alcohol_consumption), 0.4)])

    raw = [
        ("cardiovascular", "Cardiovascular", cardio, CARDIOVASCULAR_WEIGHT,
         "No blood pressure or heart rate reading was provided for this assessment."),
        ("metabolic", "Metabolic", metabolic, METABOLIC_WEIGHT,
         "Add your height and weight to your profile, or a glucose reading, to include this."),
        ("vitals", "Vitals", vitals, VITALS_WEIGHT,
         "No SpO2 or temperature reading was provided for this assessment."),
        ("activity", "Activity", activity, ACTIVITY_WEIGHT,
         "Set your exercise frequency in your profile to include this."),
        ("sleep", "Sleep", sleep, SLEEP_WEIGHT,
         "Set your average sleep duration in your profile to include this."),
        ("substance_use", "Substance use", substance, SUBSTANCE_WEIGHT,
         "Set your smoking and alcohol status in your profile to include this."),
    ]

    available_weight = sum(w for _, _, s, w, _ in raw if s is not None)
    completeness = round((available_weight / TOTAL_WEIGHT) * 100, 2)

    components: list[ComponentResult] = []
    overall = 0.0
    for key, label, score, weight, reason in raw:
        included = score is not None
        rescaled = round((weight / available_weight) * 100, 2) if included and available_weight > 0 else 0.0
        # Most combinations (0.6/0.4 weights over multiples-of-5 band scores) land on whole
        # numbers, but metabolic's 0.55/0.45 weights can produce fractions (e.g. 40.5). The API
        # contract (ComponentOut.score) is an int for a clean 0-100 bar display, so round here -
        # `overall` below still uses the precise, unrounded score.
        display_score = round(score) if included else None
        components.append(ComponentResult(
            key=key, label=label, score=display_score, weight_pct=rescaled, raw_weight_pct=weight,
            included=included, reason_excluded=None if included else reason,
        ))
        if included:
            overall += score * (rescaled / 100)

    overall_score = round(overall, 2) if available_weight > 0 else 0.0
    if overall_score >= 80:
        risk = "LOW"
    elif overall_score >= 60:
        risk = "MODERATE"
    else:
        risk = "HIGH"
    # With zero usable data there is nothing to assess; caller should reject this case earlier,
    # but guard here too rather than reporting a misleading LOW/HIGH risk for no data.
    if available_weight == 0:
        risk = "MODERATE"

    return ScoreResult(
        overall_score=overall_score, risk_category=risk, components=components,
        data_completeness_percent=completeness, low_confidence=completeness < LOW_CONFIDENCE_THRESHOLD,
    )


def breakdown_to_jsonable(result: ScoreResult) -> dict:
    """JSON-safe dict for the `health_assessments.score_breakdown` column / API response."""
    return {
        "components": [
            {"key": c.key, "label": c.label, "score": c.score, "weight_pct": c.weight_pct}
            for c in result.components if c.included
        ],
        "skipped": [
            {"key": c.key, "label": c.label, "reason": c.reason_excluded}
            for c in result.components if not c.included
        ],
    }
