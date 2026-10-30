"""Diagnostic plots saved alongside the model artifacts - standard ML-report deliverables,
distinct from the Phase 9 admin dashboard (which renders its own charts from model_info.json /
model_comparison.json directly in the React UI, not from these images).
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless - no display available in this environment
import matplotlib.pyplot as plt
from sklearn.metrics import ConfusionMatrixDisplay, RocCurveDisplay

PLOTS_DIR = Path(__file__).resolve().parents[1] / "saved_models" / "plots"


def save_model_comparison_chart(screen_results: dict, path: Path = PLOTS_DIR / "model_comparison.png"):
    path.parent.mkdir(parents=True, exist_ok=True)
    names = list(screen_results.keys())
    means = [screen_results[n]["roc_auc"]["mean"] for n in names]
    stds = [screen_results[n]["roc_auc"]["std"] for n in names]

    fig, ax = plt.subplots(figsize=(7, 4.5))
    bars = ax.bar(names, means, yerr=stds, capsize=5, color="#0d9488")
    ax.set_ylabel("Mean CV ROC-AUC")
    ax.set_title("Model family screening (cross-validated)")
    ax.set_ylim(0, 1)
    for bar, mean in zip(bars, means):
        ax.text(bar.get_x() + bar.get_width() / 2, mean + 0.02, f"{mean:.3f}", ha="center")
    plt.xticks(rotation=15)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return path


def save_confusion_matrix(y_test, y_pred, path: Path = PLOTS_DIR / "confusion_matrix.png"):
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(4.5, 4.5))
    ConfusionMatrixDisplay.from_predictions(y_test, y_pred, display_labels=["No disease", "Disease"],
                                            cmap="BuGn", ax=ax)
    ax.set_title("Final model - held-out test set")
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return path


def save_roc_curve(final_model, X_test, y_test, path: Path = PLOTS_DIR / "roc_curve.png"):
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(5, 5))
    RocCurveDisplay.from_estimator(final_model, X_test, y_test, ax=ax, curve_kwargs={"color": "#0d9488"})
    ax.plot([0, 1], [0, 1], linestyle="--", color="grey", label="Chance")
    ax.set_title("ROC curve - held-out test set")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return path
