import pytest

from app.utils.wellness_insights import compare_metric, generate_insights


class TestCompareMetric:
    def test_no_data_either_side_gives_none(self):
        assert compare_metric("exercise_minutes", None, 100) is None
        assert compare_metric("exercise_minutes", 100, None) is None
        assert compare_metric("exercise_minutes", None, None) is None

    def test_small_change_below_threshold_is_not_reported(self):
        # 5% increase - below the 10% noise threshold
        assert compare_metric("exercise_minutes", 105, 100) is None

    def test_increase_above_threshold_for_higher_is_better_metric(self):
        r = compare_metric("exercise_minutes", 150, 100)  # +50%
        assert r.direction == "improved"
        assert "increased" in r.message and "exercise" in r.message

    def test_decrease_above_threshold_for_higher_is_better_metric(self):
        r = compare_metric("sleep_hours", 5, 8)  # -37.5%
        assert r.direction == "declined"
        assert "decreased" in r.message

    @pytest.mark.parametrize("metric", ["exercise_minutes", "sleep_hours", "hydration_ml", "medicine_adherence_percent", "health_score"])
    def test_every_known_metric_is_higher_is_better(self, metric):
        # All current metrics are "more is better" - verify none were accidentally inverted
        improved = compare_metric(metric, 200, 100)
        declined = compare_metric(metric, 50, 100)
        assert improved.direction == "improved"
        assert declined.direction == "declined"

    def test_zero_previous_nonzero_current_is_new(self):
        r = compare_metric("hydration_ml", 500, 0)
        assert r.direction == "new"

    def test_both_zero_gives_none_not_new(self):
        assert compare_metric("hydration_ml", 0, 0) is None

    def test_never_claims_causation(self):
        r = compare_metric("exercise_minutes", 200, 100)
        for banned in ["because", "due to", "caused", "resulted in"]:
            assert banned not in r.message.lower()

    def test_unknown_metric_still_works_with_fallback_label(self):
        r = compare_metric("mystery_metric", 200, 100)
        assert r is not None and "mystery_metric" in r.message


class TestGenerateInsights:
    def test_only_includes_metrics_with_meaningful_change(self):
        current = {"exercise_minutes": 150, "sleep_hours": 8.0, "hydration_ml": 2000,
                  "medicine_adherence_percent": 90, "health_score": 80}
        previous = {"exercise_minutes": 100, "sleep_hours": 8.0, "hydration_ml": 2000,
                   "medicine_adherence_percent": 90, "health_score": 80}
        insights = generate_insights(current, previous)
        assert len(insights) == 1
        assert insights[0].metric == "exercise_minutes"

    def test_empty_when_nothing_changed_meaningfully(self):
        same = {"exercise_minutes": 100, "sleep_hours": 8.0, "hydration_ml": 2000,
               "medicine_adherence_percent": 90, "health_score": 80}
        assert generate_insights(same, same) == []

    def test_missing_keys_treated_as_no_data(self):
        assert generate_insights({}, {}) == []

    def test_zero_previous_with_active_baseline_compares_against_active_average(self):
        # User was inactive last week (previous=0), but active historical average is 100 min
        # Current is 150 min (+50% compared to active baseline)
        r = compare_metric("exercise_minutes", 150, 0, active_baseline=100)
        assert r is not None
        assert r.direction == "improved"
        assert "your active average" in r.message

    def test_generate_insights_with_active_baseline(self):
        current = {"exercise_minutes": 150, "sleep_hours": 8.0, "hydration_ml": 2000,
                  "medicine_adherence_percent": 90, "health_score": 80}
        previous = {"exercise_minutes": 0, "sleep_hours": 8.0, "hydration_ml": 2000,
                   "medicine_adherence_percent": 90, "health_score": 80}
        active_baseline = {"exercise_minutes": 100}
        insights = generate_insights(current, previous, active_baseline=active_baseline)
        assert len(insights) == 1
        assert insights[0].metric == "exercise_minutes"
        assert "your active average" in insights[0].message

