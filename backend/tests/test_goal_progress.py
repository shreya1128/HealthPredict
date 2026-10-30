import pytest

from app.utils.goal_progress import compute_progress


class TestInvalidTarget:
    def test_none_target(self):
        r = compute_progress("EXERCISE", None, 100)
        assert r.percentage_complete is None and r.note

    def test_zero_or_negative_target(self):
        assert compute_progress("HYDRATION", 0, 1000).percentage_complete is None
        assert compute_progress("HYDRATION", -5, 1000).percentage_complete is None


class TestNoData:
    @pytest.mark.parametrize("goal_type", ["EXERCISE", "SLEEP", "HYDRATION", "WEIGHT", "MEDICINE_ADHERENCE", "OTHER"])
    def test_missing_metric_gives_a_type_specific_note(self, goal_type):
        r = compute_progress(goal_type, 100, None)
        assert r.current_value is None and r.percentage_complete is None
        assert r.note and len(r.note) > 0


class TestStraightforwardRatioTypes:
    @pytest.mark.parametrize("goal_type", ["EXERCISE", "SLEEP", "HYDRATION", "MEDICINE_ADHERENCE"])
    def test_halfway(self, goal_type):
        r = compute_progress(goal_type, 150, 75)
        assert r.percentage_complete == 50.0 and r.current_value == 75

    @pytest.mark.parametrize("goal_type", ["EXERCISE", "SLEEP", "HYDRATION", "MEDICINE_ADHERENCE"])
    def test_exceeding_target_caps_at_100(self, goal_type):
        r = compute_progress(goal_type, 150, 300)
        assert r.percentage_complete == 100.0

    def test_zero_current_value_is_zero_percent_not_none(self):
        r = compute_progress("EXERCISE", 150, 0)
        assert r.current_value == 0 and r.percentage_complete == 0.0


class TestWeightGoal:
    def test_exactly_at_target_is_100_percent(self):
        r = compute_progress("WEIGHT", 70, 70)
        assert r.percentage_complete == 100.0

    def test_closeness_decreases_with_distance(self):
        near = compute_progress("WEIGHT", 70, 72).percentage_complete
        far = compute_progress("WEIGHT", 70, 90).percentage_complete
        assert near > far

    def test_result_never_negative(self):
        r = compute_progress("WEIGHT", 70, 500)  # wildly far from target
        assert r.percentage_complete == 0.0

    def test_weight_note_explains_it_is_closeness_not_progress(self):
        r = compute_progress("WEIGHT", 70, 75)
        assert "close" in r.note.lower()


class TestWeightGoalWithBaseline:
    def test_weight_loss_progress_from_baseline(self):
        # Starting at 80kg, target 70kg, currently at 75kg -> 5kg of 10kg lost = 50%
        r = compute_progress("WEIGHT", 70, 75, baseline_value=80)
        assert r.percentage_complete == 50.0
        assert "starting weight of 80" in r.note

    def test_weight_gain_progress_from_baseline(self):
        # Starting at 60kg, target 70kg, currently at 65kg -> 5kg of 10kg gained = 50%
        r = compute_progress("WEIGHT", 70, 65, baseline_value=60)
        assert r.percentage_complete == 50.0

    def test_target_reached_from_baseline(self):
        r = compute_progress("WEIGHT", 70, 70, baseline_value=80)
        assert r.percentage_complete == 100.0

    def test_wrong_direction_does_not_go_negative(self):
        # Starting at 80kg, target 70kg, currently 85kg -> 0%
        r = compute_progress("WEIGHT", 70, 85, baseline_value=80)
        assert r.percentage_complete == 0.0


class TestCustomOtherGoal:
    def test_manual_percentage_reporting(self):
        r = compute_progress("OTHER", 100, None, manual_percentage=42.5)
        assert r.percentage_complete == 42.5
        assert "Self-reported" in r.note

    def test_metric_ratio_for_other_goal(self):
        r = compute_progress("OTHER", 20, 10)
        assert r.percentage_complete == 50.0


class TestNoteOnlyPresentWhenNeeded:
    def test_no_note_on_successful_computation(self):
        r = compute_progress("EXERCISE", 150, 75)
        assert r.note is None

