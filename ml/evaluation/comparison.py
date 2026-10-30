"""Cross-validated comparison across model families - this, not training-set accuracy, is what
"best" is chosen from (project requirement: don't call a model best from training accuracy alone).
"""

import numpy as np
from sklearn.model_selection import StratifiedKFold, cross_validate

from config import RANDOM_STATE

SCORING = ["accuracy", "precision", "recall", "f1", "roc_auc"]


def cross_validate_models(model_pipelines: dict, X, y, folds: int) -> dict:
    """model_pipelines: {name: sklearn Pipeline}. Returns {name: {metric: {mean, std}}}."""
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=RANDOM_STATE)
    results = {}
    for name, pipeline in model_pipelines.items():
        scores = cross_validate(pipeline, X, y, cv=cv, scoring=SCORING)
        results[name] = {
            metric: {"mean": round(float(np.mean(scores[f"test_{metric}"])), 4),
                     "std": round(float(np.std(scores[f"test_{metric}"])), 4)}
            for metric in SCORING
        }
    return results


def pick_best(cv_results: dict, metric: str = "roc_auc") -> str:
    """Best mean CV score on `metric`; ties broken by lowest std (more consistent across folds)."""
    return min(cv_results, key=lambda name: (-cv_results[name][metric]["mean"], cv_results[name][metric]["std"]))
