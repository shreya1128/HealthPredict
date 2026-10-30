"""Pure unit tests for the scoring engine - no database needed."""

import pytest

from app.utils.health_score import (
    AssessmentInput, compute_health_score, score_alcohol, score_bmi, score_blood_pressure,
    score_exercise_frequency, score_glucose, score_heart_rate, score_sleep_duration, score_smoking,
    score_spo2, score_temperature,
)


class TestBloodPressure:
    def test_normal(self):
        assert score_blood_pressure(115, 75) == 100

    def test_elevated_uses_systolic_alone(self):
        assert score_blood_pressure(125, 75) == 85

    @pytest.mark.parametrize("s,d", [(135, 75), (115, 85)])  # either reading can trigger stage 1
    def test_stage1_from_either_reading(self, s, d):
        assert score_blood_pressure(s, d) == 65

    def test_worse_of_the_two_readings_wins(self):
        # systolic says "stage 1" (65), diastolic says "stage 2" (40) -> must take the worse (40)
        assert score_blood_pressure(135, 95) == 40

    def test_crisis(self):
        assert score_blood_pressure(185, 100) == 15
        assert score_blood_pressure(150, 125) == 15  # diastolic alone triggers crisis

    def test_hypotension(self):
        assert score_blood_pressure(85, 55) == 70

    def test_missing_either_value_excludes(self):
        assert score_blood_pressure(None, 75) is None
        assert score_blood_pressure(120, None) is None

    def test_boundary_exact_120_is_elevated_not_normal(self):
        assert score_blood_pressure(120, 75) == 85


class TestHeartRate:
    @pytest.mark.parametrize("hr,expected", [
        (39, 25), (40, 50), (49, 50), (50, 75), (59, 75), (60, 100), (100, 100),
        (101, 75), (110, 75), (111, 50), (120, 50), (121, 25),
    ])
    def test_bands(self, hr, expected):
        assert score_heart_rate(hr) == expected

    def test_missing(self):
        assert score_heart_rate(None) is None


class TestBMI:
    @pytest.mark.parametrize("bmi,expected", [
        (15, 15), (16.5, 30), (18, 55), (18.5, 100), (22, 100), (24.9, 100),
        (25, 70), (29.9, 70), (30, 45), (34.9, 45), (35, 25), (39.9, 25), (40, 15), (50, 15),
    ])
    def test_bands(self, bmi, expected):
        assert score_bmi(bmi) == expected

    def test_missing(self):
        assert score_bmi(None) is None


class TestGlucose:
    @pytest.mark.parametrize("g,expected", [(50, 50), (69, 50), (70, 100), (99, 100), (100, 65), (125, 65), (126, 35), (300, 35)])
    def test_bands(self, g, expected):
        assert score_glucose(g) == expected


class TestSpO2:
    @pytest.mark.parametrize("v,expected", [(85, 20), (89, 20), (90, 50), (92, 50), (93, 75), (94, 75), (95, 100), (100, 100)])
    def test_bands(self, v, expected):
        assert score_spo2(v) == expected


class TestTemperature:
    @pytest.mark.parametrize("t,expected", [
        (36.1, 100), (37.0, 100), (37.2, 100), (37.3, 70), (38.0, 70), (35.5, 70), (36.0, 70),
        (38.1, 40), (39.0, 40), (35.4, 40), (39.1, 15),
    ])
    def test_bands(self, t, expected):
        assert score_temperature(t) == expected


class TestCategoricals:
    def test_exercise(self):
        assert score_exercise_frequency("SEDENTARY") == 30
        assert score_exercise_frequency("very_active") == 100  # case-insensitive
        assert score_exercise_frequency(None) is None
        assert score_exercise_frequency("NONSENSE") is None

    def test_smoking_and_alcohol(self):
        assert score_smoking("NEVER") == 100 and score_smoking("CURRENT") == 30
        assert score_alcohol("OCCASIONALLY") == 90 and score_alcohol("HEAVILY") == 25


class TestSleep:
    @pytest.mark.parametrize("h,expected", [(3, 20), (4.5, 50), (5.5, 70), (6.5, 85), (7, 100), (9, 100), (9.5, 70), (10.5, 50)])
    def test_bands(self, h, expected):
        assert score_sleep_duration(h) == expected


class TestComposite:
    def _full_input(self, **overrides):
        base = dict(systolic_bp=115, diastolic_bp=75, heart_rate_bpm=70, blood_glucose_mg_dl=85,
                   spo2_percent=98, temperature_celsius=36.8, bmi=22, exercise_frequency="ACTIVE",
                   sleep_duration_hours=8, smoking_status="NEVER", alcohol_consumption="NEVER")
        base.update(overrides)
        return AssessmentInput(**base)

    def test_perfect_input_scores_high_and_low_risk(self):
        r = compute_health_score(self._full_input())
        assert r.overall_score >= 95
        assert r.risk_category == "LOW"
        assert r.data_completeness_percent == 100.0
        assert r.low_confidence is False
        assert len(r.components) == 6
        assert all(c.included for c in r.components)
        assert round(sum(c.weight_pct for c in r.components), 2) == 100.0

    def test_all_worst_case_scores_low_and_high_risk(self):
        r = compute_health_score(self._full_input(
            systolic_bp=190, diastolic_bp=125, heart_rate_bpm=140, blood_glucose_mg_dl=250,
            spo2_percent=85, temperature_celsius=40, bmi=45, exercise_frequency="SEDENTARY",
            sleep_duration_hours=2, smoking_status="CURRENT", alcohol_consumption="HEAVILY",
        ))
        assert r.overall_score <= 30
        assert r.risk_category == "HIGH"

    def test_missing_data_is_excluded_and_remaining_weight_rescales_to_100(self):
        # Only heart rate provided - nothing else.
        data = AssessmentInput(heart_rate_bpm=70)
        r = compute_health_score(data)
        included = [c for c in r.components if c.included]
        assert [c.key for c in included] == ["cardiovascular"]
        assert included[0].weight_pct == 100.0          # fully rescaled onto the one available component
        assert included[0].score == 100
        assert r.overall_score == 100.0
        assert round(r.data_completeness_percent, 2) == 30.0  # cardio is 30% of the total weight
        assert r.low_confidence is True                       # 30% < 50% threshold
        skipped_keys = {c.key for c in r.components if not c.included}
        assert skipped_keys == {"metabolic", "vitals", "activity", "sleep", "substance_use"}
        assert all(c.reason_excluded for c in r.components if not c.included)

    def test_partial_component_still_counts_at_full_component_weight(self):
        """Only systolic+diastolic (no HR) -> cardiovascular is still 100% included, just BP-only."""
        r = compute_health_score(AssessmentInput(systolic_bp=115, diastolic_bp=75))
        cardio = next(c for c in r.components if c.key == "cardiovascular")
        assert cardio.included and cardio.score == 100

    def test_completely_empty_input_gives_zero_not_a_crash(self):
        r = compute_health_score(AssessmentInput())
        assert r.overall_score == 0.0
        assert r.data_completeness_percent == 0.0
        assert all(not c.included for c in r.components)

    def test_risk_thresholds_at_exact_boundaries(self):
        # Force overall_score via BP-only input at specific bands: 100(normal) / 65(stage1) / 15(crisis)
        assert compute_health_score(AssessmentInput(systolic_bp=115, diastolic_bp=75)).risk_category == "LOW"     # 100
        assert compute_health_score(AssessmentInput(systolic_bp=135, diastolic_bp=75)).risk_category == "MODERATE"  # 65
        assert compute_health_score(AssessmentInput(systolic_bp=185, diastolic_bp=75)).risk_category == "HIGH"    # 15

    def test_component_scores_are_always_whole_numbers(self):
        """Regression: metabolic's 0.55/0.45 weights can produce fractional combined scores
        (e.g. BMI=45, glucose=35 -> 0.55*45+0.45*35=40.5), which the API schema (an int field,
        for a clean 0-100 display) would reject. Found via a live end-to-end check, not a
        narrower unit test - this specific BMI+glucose pair is the case that exposed it."""
        r = compute_health_score(AssessmentInput(bmi=32.3, blood_glucose_mg_dl=135))
        metabolic = next(c for c in r.components if c.key == "metabolic")
        assert metabolic.included
        assert isinstance(metabolic.score, int)

    @pytest.mark.parametrize("bmi,glucose", [
        (45, 35), (32.3, 135), (24.2, 88), (70, 65), (18, 300),
    ])
    def test_metabolic_component_score_is_always_int_across_many_inputs(self, bmi, glucose):
        r = compute_health_score(AssessmentInput(bmi=bmi, blood_glucose_mg_dl=glucose))
        metabolic = next(c for c in r.components if c.key == "metabolic")
        assert isinstance(metabolic.score, int)

    def test_disclaimer_always_present(self):
        r = compute_health_score(AssessmentInput())
        assert "not a medical diagnosis" in r.disclaimer
