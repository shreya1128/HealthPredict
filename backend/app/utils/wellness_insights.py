"""Compares this period's metrics against the previous period to generate plain-language
insights (e.g. "Your exercise this week increased compared to last week").

Pure function, no DB - takes two already-aggregated values per metric and decides whether the
change is worth mentioning. Deliberately conservative: a metric is only called out if it changed
by more than CHANGE_THRESHOLD_PERCENT, to avoid noisy, misleading claims from small fluctuations
or rounding. Never attributes a cause - only reports the direction and the two numbers, per the
project's "do not present correlation as causation" principle (the same rule SHAP explanations
follow in docs/ml-methodology.md).
"""

from dataclasses import dataclass
from typing import Optional

CHANGE_THRESHOLD_PERCENT = 10.0


@dataclass
class Insight:
    metric: str
    direction: str  # "improved" | "declined" | "stable" | "new"
    message: str


# For each metric: whether a numeric increase counts as "improved" (True) or "declined" (False).
_HIGHER_IS_BETTER = {
    "exercise_minutes": True, "sleep_hours": True, "hydration_ml": True,
    "medicine_adherence_percent": True, "health_score": True,
}

_LABELS = {
    "exercise_minutes": "exercise", "sleep_hours": "sleep", "hydration_ml": "hydration",
    "medicine_adherence_percent": "medicine adherence", "health_score": "health score",
}


def compare_metric(
    metric: str,
    current: Optional[float],
    previous: Optional[float],
    active_baseline: Optional[float] = None,
) -> Optional[Insight]:
    """None if there isn't enough data to say anything, or the change is below the noise
    threshold. When the immediately preceding week was inactive (0 or None) but an active
    historical baseline is available, compares against the active baseline."""
    label = _LABELS.get(metric, metric)
    if current is None:
        return None

    baseline_used = "the previous period"
    reference = previous

    if reference is None or reference == 0:
        if active_baseline is not None and active_baseline > 0:
            reference = active_baseline
            baseline_used = "your active average"
        elif reference == 0:
            if current == 0:
                return None  # nothing happened in either period
            return Insight(metric, "new", f"You started tracking {label} this period.")
        else:
            return None

    change_percent = (current - reference) / reference * 100
    higher_is_better = _HIGHER_IS_BETTER.get(metric, True)

    if abs(change_percent) < CHANGE_THRESHOLD_PERCENT:
        return None  # not worth mentioning - avoids noisy "improved by 2%" messages

    went_up = change_percent > 0
    direction = ("improved" if went_up == higher_is_better else "declined")
    trend_word = "increased" if went_up else "decreased"
    return Insight(metric, direction, f"Your {label} {trend_word} compared to {baseline_used}.")


def generate_insights(
    current: dict,
    previous: dict,
    active_baseline: Optional[dict] = None,
) -> list[Insight]:
    """current/previous/active_baseline: {metric_name: value_or_None}, same keys as _LABELS."""
    insights = []
    base_dict = active_baseline or {}
    for metric in _LABELS:
        result = compare_metric(
            metric,
            current.get(metric),
            previous.get(metric),
            active_baseline=base_dict.get(metric),
        )
        if result:
            insights.append(result)
    return insights
