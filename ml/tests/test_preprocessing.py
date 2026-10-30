import pandas as pd
import pytest

from preprocessing.cleaner import clean_data
from preprocessing.feature_engineering import drop_bmi_outliers, engineer_features


def make_row(**overrides):
    row = dict(id=1, age=20000, gender=1, height=165, weight=65, ap_hi=120, ap_lo=80,
              cholesterol=1, gluc=1, smoke=0, alco=0, active=1, cardio=0)
    row.update(overrides)
    return row


def df_of(*rows):
    return pd.DataFrame(rows)


class TestCleanData:
    def test_drops_id_column(self):
        out = clean_data(df_of(make_row()))
        assert "id" not in out.columns

    def test_drops_exact_duplicates(self):
        out = clean_data(df_of(make_row(id=1), make_row(id=2)))  # differ only by id, which is dropped first
        assert len(out) == 1

    @pytest.mark.parametrize("field,bad,good", [
        ("height", 55, 165), ("height", 250, 165),
        ("weight", 10, 65), ("weight", 500, 65),
        ("ap_hi", -150, 120), ("ap_hi", 16020, 120),
        ("ap_lo", -70, 80), ("ap_lo", 11000, 80),
    ])
    def test_drops_out_of_range_values(self, field, bad, good):
        out = clean_data(df_of(make_row(**{field: bad}), make_row(**{field: good}, id=2)))
        assert len(out) == 1

    def test_drops_reversed_blood_pressure(self):
        out = clean_data(df_of(make_row(ap_hi=80, ap_lo=120), make_row(id=2)))
        assert len(out) == 1

    def test_keeps_boundary_values(self):
        # Exactly at the documented bounds (matches AssessmentCreate ranges) should survive.
        out = clean_data(df_of(make_row(ap_hi=60, ap_lo=30, height=120, weight=30)))
        assert len(out) == 1

    def test_realistic_batch_retention(self):
        rows = [make_row(id=i) for i in range(10)] + [make_row(id=100, ap_hi=99999)]
        out = clean_data(df_of(*rows))
        assert len(out) == 1  # the 10 duplicates collapse to 1, the bad row is dropped


class TestFeatureEngineering:
    def test_age_converted_to_years(self):
        out = engineer_features(df_of(make_row(age=18262)))  # 50.0 years at 365.25 d/yr... check below
        assert out.loc[0, "age_years"] == pytest.approx(18262 / 365.25, abs=0.05)

    def test_bmi_matches_app_formula(self):
        # Same formula as database/schema.sql's generated column: weight / (height/100)^2
        out = engineer_features(df_of(make_row(height=170, weight=72.5)))
        assert out.loc[0, "bmi"] == pytest.approx(72.5 / (1.70 ** 2), abs=0.01)

    def test_pulse_pressure_and_map(self):
        out = engineer_features(df_of(make_row(ap_hi=120, ap_lo=80)))
        assert out.loc[0, "pulse_pressure"] == 40
        assert out.loc[0, "map_pressure"] == pytest.approx(80 + 40 / 3, abs=0.05)

    def test_gender_remapped_to_zero_one(self):
        out = engineer_features(df_of(make_row(gender=1), make_row(gender=2)))
        assert list(out["gender"]) == [0, 1]

    def test_unexpected_gender_value_raises(self):
        with pytest.raises(ValueError):
            engineer_features(df_of(make_row(gender=9)))


class TestBmiOutlierFilter:
    def test_drops_jointly_implausible_combination(self):
        # Individually plausible (within cleaner's ranges) but BMI 108 - must be caught here.
        implausible = engineer_features(df_of(make_row(height=122, weight=161)))
        out = drop_bmi_outliers(implausible)
        assert len(out) == 0

    def test_keeps_plausible_combination(self):
        plausible = engineer_features(df_of(make_row(height=170, weight=72)))
        out = drop_bmi_outliers(plausible)
        assert len(out) == 1

    def test_default_bounds_are_14_to_60(self):
        edge_low = engineer_features(df_of(make_row(height=200, weight=56)))   # bmi = 14.0
        edge_high = engineer_features(df_of(make_row(height=150, weight=135))) # bmi = 60.0
        assert len(drop_bmi_outliers(edge_low)) == 1
        assert len(drop_bmi_outliers(edge_high)) == 1
