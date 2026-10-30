# Dataset: Cardiovascular Disease Dataset

**File:** `cardio_train.csv` (70,000 rows x 13 columns, semicolon-separated)
**SHA-256:** `21a705d23381b0dfd6a6416da701b490744f1fc3b47e9ff3db3968c420ffa10c`

## Provenance

Originally published on Kaggle as the "Cardiovascular Disease dataset" by Svetlana Ulianova:
https://www.kaggle.com/datasets/sulianova/cardiovascular-disease-dataset. This environment's
network access does not include kaggle.com, so the file was retrieved from a GitHub mirror that
commits the identical CSV
(`raw.githubusercontent.com/JADEJAVEERBHADRASINH/Cardiovascular-Disease-Prediction/main/cardio_train.csv`,
byte-identical to at least one other independent mirror checked at the same time). The row count
(70,000), column names, and data quality issues (see below) match the dataset's well-documented
public description, which is why it is treated as genuine rather than re-verified against Kaggle
directly.

**License:** commonly documented as CC0 (Public Domain). This was not read directly off the
original Kaggle page (not reachable from this environment); the strongest evidence found is a
Kaggle-hosted derivative, explicitly described as "a cleaned up copy of cardio_train.csv" sourced
from this exact dataset, which itself carries a `CC0: Public Domain` license tag - consistent
with, but not direct confirmation of, the original's own listing. Before any real-world or
commercial use, re-download directly from Kaggle and confirm the license terms currently posted
there.

## Target variable

`cardio` - binary, 1 if the patient has cardiovascular disease, 0 otherwise. Near-perfectly
balanced (49.5% positive after cleaning), so no class-imbalance handling was needed.

**How the label was determined is not documented by the dataset's authors.** This is the
single most important limitation: it is unknown whether `cardio` reflects a clinician's diagnosis,
a self-report, or something else. The model trained on it should be read as "predicts the same
kind of label this dataset contains," not as "diagnoses cardiovascular disease."

## Features (raw columns)

| Column | Description | Type |
|---|---|---|
| `age` | Age in **days** (converted to years during feature engineering) | int |
| `gender` | 1 or 2 (undocumented in the file; community-established convention is 1=female, 2=male - remapped to 0/1 in feature engineering) | categorical |
| `height` | cm | int |
| `weight` | kg | float |
| `ap_hi` | Systolic blood pressure (mmHg) | int |
| `ap_lo` | Diastolic blood pressure (mmHg) | int |
| `cholesterol` | 1=normal, 2=above normal, 3=well above normal (exact mg/dL cutoffs not documented) | ordinal |
| `gluc` | 1=normal, 2=above normal, 3=well above normal (exact mg/dL cutoffs not documented) | ordinal |
| `smoke` | 0/1 | binary |
| `alco` | 0/1, alcohol intake | binary |
| `active` | 0/1, physically active | binary |
| `cardio` | target | binary |

`id` is a row identifier only and is dropped before modeling.

## Why this dataset was chosen

- **Feature alignment with this app.** Nearly every column maps directly onto data the app
  already collects: age, gender, height/weight (-> BMI, same formula as the app's generated
  column), systolic/diastolic blood pressure, smoking, alcohol, physical activity. `cholesterol`
  and `gluc` are the two partial exceptions - see the Phase 5 integration note below.
- **Real-world data quality**, not a toy dataset: it contains genuine entry errors (blood
  pressure readings up to 16,020 or below zero) that had to be found and removed, which is
  realistic practice rather than a pre-cleaned exercise (see `docs/ml-methodology.md`).
- **Size and balance.** 70,000 rows with a near-50/50 target split support a proper train/test
  split plus cross-validation without needing resampling techniques.
- **Public and widely used** - many independently published analyses of this exact dataset exist
  (accuracy commonly reported in the 70-74% range, ROC-AUC around 0.78-0.80 for tree-based
  models), which gave an external sanity check: this project's own held-out results
  (73.4% accuracy, 0.80 ROC-AUC) land in the same range, evidence against a leakage or
  implementation bug rather than proof of a fundamentally sound dataset.

## Limitations

- **Undocumented label provenance** (above) - the most important caveat.
- **Undocumented measurement conditions.** It's not stated whether blood pressure was measured by
  a clinician or self-reported, seated or otherwise, medicated or not.
- **No cholesterol/glucose numeric values**, only a 3-level ordinal category with undisclosed
  cutoffs - these can't be reconstructed from the app's own continuous glucose reading with full
  precision (an ADA-consistent approximation is used; see `docs/ml-methodology.md`).
- **No demographic/geographic metadata** - unknown population, unknown whether it represents the
  app's likely user base.
- **Cross-sectional, not longitudinal** - the model can only learn associations present in a
  single snapshot per patient, not how risk changes over time for one person.
- **Age range:** approximately 30-65 years in this dataset (after cleaning); predictions for
  people outside that range are an extrapolation the model was not trained to make.

Given these, and consistent with the rest of this project: **the resulting model is a
statistical association model, not a diagnostic tool**, and every prediction must be labelled
accordingly when it is wired into the API in Phase 5.
