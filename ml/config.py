"""Shared configuration for the ML pipeline. Single source of truth for paths and constants
used by preprocessing, training, evaluation and prediction."""

from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
DATASET_PATH = ML_DIR / "dataset" / "cardio_train.csv"
SAVED_MODELS_DIR = ML_DIR / "saved_models"
BEST_MODEL_PATH = SAVED_MODELS_DIR / "best_model.joblib"
MODEL_INFO_PATH = SAVED_MODELS_DIR / "model_info.json"
COMPARISON_PATH = SAVED_MODELS_DIR / "model_comparison.json"

RANDOM_STATE = 42
TEST_SIZE = 0.20
CV_FOLDS = 5

# This environment has a single CPU core (confirmed via `nproc`), so sklearn's n_jobs parallelism
# is unavailable (n_jobs=-1 would spawn workers that only compete for the one core, and was
# measured to be net-harmful). To keep the full pipeline runnable in reasonable wall-clock time:
#   - initial model-family SCREENING runs on a stratified subsample, to cheaply rank the 4
#     architectures against each other (relative ranking is stable at this sample size; see
#     docs/ml-methodology.md for the full-CV numbers obtained for the winning family).
#   - hyperparameter TUNING of the winning family runs on a larger (but still partial) subsample.
#   - the model that actually gets saved is fit ONCE on the FULL training set with the winning
#     hyperparameters, and evaluated ONCE on the full, untouched held-out test set - so the
#     reported final metrics are never computed on a subsample.
SCREEN_SAMPLE_SIZE = 6000
SCREEN_CV_FOLDS = 3
TUNE_SAMPLE_SIZE = 15000
TUNE_CV_FOLDS = 3

# Plausible-value ranges used for cleaning. The blood-pressure bounds intentionally match
# backend/app/schemas/health.py's AssessmentCreate validation, so the model is trained on the
# same input domain the app can actually submit at inference time.
RANGES = {
    "height_cm": (120, 220),
    "weight_kg": (30, 200),
    "ap_hi": (60, 260),   # matches AssessmentCreate.systolic_bp
    "ap_lo": (30, 200),   # matches AssessmentCreate.diastolic_bp
}

TARGET_COLUMN = "cardio"

# Continuous features - scaled. Categorical/ordinal/binary features - passed through unscaled.
# See docs/ml-methodology.md for the reasoning.
CONTINUOUS_FEATURES = ["age_years", "height_cm", "weight_kg", "bmi", "ap_hi", "ap_lo",
                       "pulse_pressure", "map_pressure"]
CATEGORICAL_FEATURES = ["gender", "cholesterol", "gluc", "smoke", "alco", "active"]
FEATURE_COLUMNS = CONTINUOUS_FEATURES + CATEGORICAL_FEATURES

# gender: dataset convention is 1=female, 2=male (undocumented in the raw file, established by
# the dataset's own community documentation). Remapped here to 0=female, 1=male for clarity.
GENDER_MAP = {1: 0, 2: 1}
