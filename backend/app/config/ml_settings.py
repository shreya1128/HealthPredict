"""Path to the trained model artifact. Decoupled from ml/'s own Python package on purpose: the
only contract between ml/ (training) and backend/ (serving) is the saved joblib artifact plus the
FEATURE_COLUMNS list documented in docs/ml-methodology.md - no shared/imported code, no sys.path
manipulation, no risk of the two namespaces colliding. See services/prediction_service.py.
"""

from pathlib import Path

from app.config.settings import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]

_raw_path = Path(settings.ML_MODEL_PATH)
if _raw_path.is_absolute():
    _candidate = _raw_path
elif (BACKEND_DIR / _raw_path).exists():
    _candidate = BACKEND_DIR / _raw_path
elif (BACKEND_DIR.parent / _raw_path).exists():
    _candidate = BACKEND_DIR.parent / _raw_path
else:
    _candidate = BACKEND_DIR.parent / "ml" / "saved_models"

if _candidate.is_file():
    ML_MODEL_PATH = _candidate
    ML_MODEL_INFO_PATH = _candidate.parent / "model_info.json"
else:
    ML_MODEL_PATH = _candidate / "best_model.joblib"
    ML_MODEL_INFO_PATH = _candidate / "model_info.json"

