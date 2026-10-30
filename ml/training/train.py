#!/usr/bin/env python3
"""Main training script - staged for a single-core environment (see config.py):

  1. Prepare the full cleaned/engineered dataset, split train/test (test set untouched until step 4).
  2. SCREEN all 4 model families via cross-validation on a small stratified subsample of the
     training set, to cheaply rank the architectures.
  3. TUNE the winning family's hyperparameters via grid search on a larger subsample.
  4. Fit the tuned model ONCE on the FULL training set, evaluate ONCE on the full held-out test
     set, and save it - so the model that ships and the metrics that are reported both reflect
     the complete data, never a subsample.

Run from ml/:  python training/train.py
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

from config import (
    BEST_MODEL_PATH, COMPARISON_PATH, FEATURE_COLUMNS, MODEL_INFO_PATH, RANDOM_STATE,
    SAVED_MODELS_DIR, SCREEN_CV_FOLDS, SCREEN_SAMPLE_SIZE, TARGET_COLUMN, TEST_SIZE,
    TUNE_CV_FOLDS, TUNE_SAMPLE_SIZE,
)
from evaluation.comparison import cross_validate_models, pick_best
from evaluation.metrics import compute_metrics
from evaluation.plots import save_confusion_matrix, save_model_comparison_chart, save_roc_curve
from preprocessing.cleaner import clean_data
from preprocessing.data_loader import load_raw_data
from preprocessing.feature_engineering import drop_bmi_outliers, engineer_features
from preprocessing.pipeline import build_preprocessor
from training.models import MODEL_DEFINITIONS


def prepare_dataset():
    raw = load_raw_data()
    cleaned = clean_data(raw)
    featured = drop_bmi_outliers(engineer_features(cleaned))
    counts = {"raw_rows": len(raw), "after_cleaning": len(cleaned), "after_bmi_filter": len(featured)}
    X = featured[FEATURE_COLUMNS]
    y = featured[TARGET_COLUMN]
    return X, y, counts


def stratified_subsample(X, y, n, random_state=RANDOM_STATE):
    if n >= len(X):
        return X, y
    X_sub, _, y_sub, _ = train_test_split(X, y, train_size=n, stratify=y, random_state=random_state)
    return X_sub, y_sub


def main():
    t0 = time.time()
    print("=" * 70, flush=True)
    print("HealthPredict ML training pipeline", flush=True)
    print("=" * 70, flush=True)

    X, y, counts = prepare_dataset()
    print(f"Dataset: {counts['raw_rows']} raw -> {counts['after_cleaning']} after cleaning "
         f"-> {counts['after_bmi_filter']} after BMI-outlier filter "
         f"({100*counts['after_bmi_filter']/counts['raw_rows']:.1f}% of raw retained)", flush=True)
    print(f"Target balance: {y.mean():.3f} positive (cardio=1)", flush=True)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE)
    print(f"Train: {len(X_train)} | Test (held out until the very end): {len(X_test)}", flush=True)

    # ---- Step 1: screen all 4 model families on a stratified subsample ----
    print(f"\n--- Screening 4 model families ({SCREEN_CV_FOLDS}-fold CV on "
         f"{SCREEN_SAMPLE_SIZE}-row subsample) ---", flush=True)
    t_stage = time.time()
    X_screen, y_screen = stratified_subsample(X_train, y_train, SCREEN_SAMPLE_SIZE)
    pipelines = {
        name: Pipeline([("preprocess", build_preprocessor()), ("model", spec["estimator"])])
        for name, spec in MODEL_DEFINITIONS.items()
    }
    screen_results = cross_validate_models(pipelines, X_screen, y_screen, folds=SCREEN_CV_FOLDS)
    for name, metrics in screen_results.items():
        print(f"  {name:20s} ROC-AUC {metrics['roc_auc']['mean']:.4f} (+/-{metrics['roc_auc']['std']:.4f})"
             f"  |  accuracy {metrics['accuracy']['mean']:.4f}  |  f1 {metrics['f1']['mean']:.4f}", flush=True)
    best_name = pick_best(screen_results, metric="roc_auc")
    print(f"Best by mean CV ROC-AUC: {best_name}  ({time.time()-t_stage:.1f}s)", flush=True)

    # ---- Step 2: tune the winning family on a larger subsample ----
    print(f"\n--- Tuning {best_name} ({TUNE_CV_FOLDS}-fold CV on {TUNE_SAMPLE_SIZE}-row subsample) ---", flush=True)
    t_stage = time.time()
    X_tune, y_tune = stratified_subsample(X_train, y_train, TUNE_SAMPLE_SIZE)
    tune_pipeline = Pipeline([("preprocess", build_preprocessor()), ("model", MODEL_DEFINITIONS[best_name]["estimator"])])
    param_grid = MODEL_DEFINITIONS[best_name]["param_grid"]
    cv = StratifiedKFold(n_splits=TUNE_CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    search = GridSearchCV(tune_pipeline, param_grid, scoring="roc_auc", cv=cv, refit=False)
    search.fit(X_tune, y_tune)
    print(f"Best params: {search.best_params_}", flush=True)
    print(f"Best CV ROC-AUC while tuning: {search.best_score_:.4f}  ({time.time()-t_stage:.1f}s)", flush=True)

    # ---- Step 3: fit the tuned model ONCE on the full training set ----
    print(f"\n--- Fitting final {best_name} on the FULL training set ({len(X_train)} rows) ---", flush=True)
    t_stage = time.time()
    final_model = Pipeline([("preprocess", build_preprocessor()), ("model", MODEL_DEFINITIONS[best_name]["estimator"])])
    final_model.set_params(**search.best_params_)
    final_model.fit(X_train, y_train)
    print(f"Fit time: {time.time()-t_stage:.1f}s", flush=True)

    # ---- Step 4: evaluate ONCE on the held-out test set (never touched above) ----
    print("\n--- Final evaluation on held-out test set ---", flush=True)
    y_pred = final_model.predict(X_test)
    y_proba = final_model.predict_proba(X_test)[:, 1]
    test_metrics = compute_metrics(y_test, y_pred, y_proba)
    for k, v in test_metrics.items():
        print(f"  {k}: {v}", flush=True)

    # ---- Save everything ----
    SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, BEST_MODEL_PATH)

    model_info = {
        "model_name": best_name,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "sklearn_pipeline_steps": [s[0] for s in final_model.steps],
        "hyperparameters": search.best_params_,
        "feature_columns": FEATURE_COLUMNS,
        "target_column": TARGET_COLUMN,
        "dataset_counts": counts,
        "train_rows": len(X_train), "test_rows": len(X_test),
        "screen_sample_size": SCREEN_SAMPLE_SIZE, "tune_sample_size": TUNE_SAMPLE_SIZE,
        "tune_cv_roc_auc": round(float(search.best_score_), 4),
        "test_metrics": test_metrics,
        "random_state": RANDOM_STATE,
        "training_duration_seconds": round(time.time() - t0, 1),
    }
    MODEL_INFO_PATH.write_text(json.dumps(model_info, indent=2))
    COMPARISON_PATH.write_text(json.dumps(screen_results, indent=2))

    save_model_comparison_chart(screen_results)
    save_confusion_matrix(y_test, y_pred)
    save_roc_curve(final_model, X_test, y_test)

    print(f"\nSaved model -> {BEST_MODEL_PATH}", flush=True)
    print(f"Saved model info -> {MODEL_INFO_PATH}", flush=True)
    print(f"Saved screening comparison -> {COMPARISON_PATH}", flush=True)
    print(f"Total time: {time.time() - t0:.1f}s", flush=True)
    return model_info, screen_results


if __name__ == "__main__":
    main()
