"""Computes a wellness goal's current progress from the relevant tracking data - live,
on each request, with support for baseline-calibrated weight goals, manual percentage
for custom goals, and persistent progress tracking.

Each goal_type reads a different metric, summarized by the caller (goal_service.py) and passed
in as `current_metric` - this module only does the final current-vs-target math, which is what
makes it cheaply unit-testable without a database.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ProgressResult:
    current_value: Optional[float]
    percentage_complete: Optional[float]  # None when it genuinely can't be computed
    note: Optional[str] = None            # shown in the UI when percentage_complete is None or provides context


def compute_progress(
    goal_type: str,
    target_value: Optional[float],
    current_metric: Optional[float],
    baseline_value: Optional[float] = None,
    manual_percentage: Optional[float] = None,
) -> ProgressResult:
    if target_value is None or target_value <= 0:
        return ProgressResult(current_metric, None, "This goal has no valid target value set.")

    # 1. Custom / OTHER goal types with manual percentage logging
    if goal_type == "OTHER":
        if manual_percentage is not None:
            pct = max(0.0, min(100.0, round(float(manual_percentage), 1)))
            return ProgressResult(current_metric or float(manual_percentage), pct, "Self-reported progress for custom goal.")
        if current_metric is not None:
            pct = max(0.0, min(100.0, round(current_metric / target_value * 100, 1)))
            return ProgressResult(current_metric, pct)
        return ProgressResult(None, None, _no_data_note(goal_type))

    if current_metric is None:
        return ProgressResult(None, None, _no_data_note(goal_type))

    # 2. WEIGHT goals: evaluate true distance traversed from baseline when available
    if goal_type == "WEIGHT":
        if target_value == 0:
            return ProgressResult(current_metric, None, "Target weight cannot be zero.")

        if baseline_value is not None and baseline_value != target_value:
            total_delta = abs(target_value - baseline_value)
            if target_value < baseline_value:
                # Weight loss goal
                achieved_delta = baseline_value - current_metric
            else:
                # Weight gain / muscle building goal
                achieved_delta = current_metric - baseline_value

            pct = (achieved_delta / total_delta) * 100
            pct = max(0.0, min(100.0, round(pct, 1)))
            note = f"Progress calculated from your starting weight of {baseline_value} kg toward {target_value} kg."
            return ProgressResult(current_metric, pct, note)

        # Fallback to closeness-to-target measure when baseline was not recorded
        pct = 100 - abs(current_metric - target_value) / target_value * 100
        pct = max(0.0, min(100.0, round(pct, 1)))
        return ProgressResult(
            current_metric, pct,
            "Shows how close your current weight is to your target, not progress from a starting point."
        )

    # 3. EXERCISE, SLEEP, HYDRATION, MEDICINE_ADHERENCE: straightforward current-vs-target ratio.
    pct = max(0.0, min(100.0, round(current_metric / target_value * 100, 1)))
    return ProgressResult(current_metric, pct)


def _no_data_note(goal_type: str) -> str:
    return {
        "EXERCISE": "Log some exercise this week to start tracking progress.",
        "SLEEP": "Log your sleep to start tracking progress.",
        "HYDRATION": "Log some water intake today to start tracking progress.",
        "WEIGHT": "Add your weight to your profile to start tracking progress.",
        "MEDICINE_ADHERENCE": "Add an active medicine to start tracking adherence progress.",
        "OTHER": "Progress tracking is not yet available for custom goals. Update progress percentage manually.",
    }.get(goal_type, "Not enough data yet to compute progress.")
