# Health Score Methodology

Implementation: `backend/app/utils/health_score.py` (81 unit tests, `backend/tests/test_health_score.py`).

## What this is, and isn't

The Health Score is a **rule-based, deterministic** wellness indicator: every input maps to a
sub-score through fixed, published bands, and the overall score is a weighted average. Nothing
about it is learned, random, or hardcoded per-request - the same inputs always produce the same
score, and the formula is public (this document).

It is **not** the machine-learning model (Phase 4/5, `health_predictions` table). That model will
be trained on a real dataset, validated, and will produce its own separate risk estimate with SHAP
explainability. The two are intentionally kept apart: this score can be computed and explained the
moment a user submits an assessment, with no training data required.

**The Health Score is an educational wellness indicator and is not a medical diagnosis. Consult a
qualified healthcare professional for medical concerns.** This disclaimer is returned in every API
response (`disclaimer` field) and must be shown wherever the score is displayed.

## Inputs

Two sources are combined for each assessment:

- **Vitals**, entered at assessment time: blood pressure, resting heart rate, blood glucose, SpO2,
  temperature.
- **Profile snapshot**, read from `user_profiles` at the moment of assessment: BMI (computed by
  MySQL from height/weight, see `database/schema.sql`), exercise frequency, sleep duration, smoking
  status, alcohol consumption.

Splitting inputs this way avoids asking the user to re-enter their height and lifestyle on every
assessment - they set it once in their profile and it is reused. If the profile is incomplete, the
assessment still proceeds (see "Missing data" below).

## Components and weights

| Component | Weight | Sub-scores | Combination |
|---|---|---|---|
| Cardiovascular | 30% | blood pressure, resting heart rate | 60% BP + 40% HR |
| Metabolic | 25% | BMI, blood glucose | 55% BMI + 45% glucose |
| Vitals | 10% | SpO2, temperature | 60% SpO2 + 40% temperature |
| Activity | 15% | exercise frequency | - |
| Sleep | 10% | sleep duration | - |
| Substance use | 10% | smoking, alcohol | 60% smoking + 40% alcohol |

Weights sum to 100 and were chosen to weight cardiovascular and metabolic indicators (the
components with the strongest, best-established evidence base) more heavily than the single-factor
components. They are a design choice, not a clinical formula - see "Limitations".

## Sub-score bands

Each measure maps to a 0-100 sub-score via fixed bands (see `score_*` functions in
`health_score.py` for exact boundaries, and `test_health_score.py` for every boundary tested):

- **Blood pressure** - American Heart Association categories (normal / elevated / stage 1 / stage
  2 / hypertensive crisis). The more severe of the systolic and diastolic reading is used, matching
  AHA guidance. A low-BP band is also included.
- **Heart rate (resting)** - AHA's general-population normal range of 60-100 bpm scores 100;
  further from that range scores progressively lower.
- **BMI** - WHO classification (underweight / normal / overweight / obese classes I-III).
- **Blood glucose** - ADA-style ranges (normal / prediabetes / diabetes range). See the fasting
  caveat below.
- **SpO2** - WHO-referenced hypoxemia thresholds; ≥95% scores 100.
- **Temperature** - normal range ~36.1-37.2°C; deviations in either direction score lower.
- **Exercise frequency** - a monotonic mapping from the profile's five-level scale
  (SEDENTARY→30 ... VERY_ACTIVE→100), loosely informed by WHO physical-activity guidance.
- **Sleep duration** - CDC/NIH adult guidance of 7-9 hours scores 100; less or more scores lower.
- **Smoking / alcohol** - monotonic mappings from the profile's categorical status fields.

## Missing data: rescaling, not fabrication

If a measure is missing, its component (or sub-part) is left out of the calculation entirely - the
engine never invents a value. The remaining components' weights are then rescaled proportionally so
they still sum to 100. For example, if only a heart-rate reading is provided, the cardiovascular
component (30% of the full weight) becomes 100% of the score, using the heart-rate sub-score alone.

Every response reports `data_completeness_percent` (how much of the full 100% weight was actually
available) and `low_confidence: true` when that drops below 50%, together with which components
were skipped and why (`score_breakdown.skipped`). The frontend surfaces this directly rather than
presenting a partial score as if it were complete.

If literally nothing is available, no assessment is created (the API requires at least one vital
sign; see `backend/app/schemas/health.py`).

## Risk category

The overall score maps to a risk category: **LOW** ≥ 80, **MODERATE** 60-79, **HIGH** < 60. This is
a separate, simple threshold on top of the rule-based score - not a clinical risk stratification,
and not the ML model's (differently-derived) risk level.

## Trend history

Each completed assessment upserts that day's row in `health_history` (one row per user per day). A
second assessment on the same day overwrites that day's snapshot rather than creating a duplicate,
so `GET /api/health/history` returns a clean one-point-per-day series for charting.

## Known limitations

- **Glucose has no fasting/random distinction.** The current form does not ask when the reading was
  taken, so the bands above are necessarily approximate. Every response with a glucose reading
  carries a `glucose_caveat` string making this explicit; the assessment form also hints at it.
- **Resting heart-rate bands are general-population defaults** and do not account for athletes,
  medication effects, or age.
- **Hydration is intentionally excluded** from this score. The profile only stores a daily water
  *goal*, not what the user actually drank; inventing a hydration sub-score from a goal would
  violate the project's "no fabricated values" requirement. Hydration will be added once the Phase 7
  tracker provides a real daily intake figure.
- **The component weights (30/25/10/15/10/10) are a documented design choice**, not a validated
  clinical instrument. They have not been calibrated against outcomes data.
- **This is not adjusted for age, sex, pregnancy, or existing diagnosed conditions.** A reading that
  is normal for one person may not be for another; the score does not know this.

## Where the numbers are stored

`health_assessments.score_breakdown` (JSON) stores exactly what the API returned for that
assessment, so a historical result can always be displayed with its original explanation even if
the scoring formula changes later. `health_assessments.data_completeness_percent` is stored
alongside it. See `database/schema.sql`.
