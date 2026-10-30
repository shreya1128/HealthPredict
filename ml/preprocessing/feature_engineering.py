"""Feature engineering: unit conversion, derived clinical features, and encoding.

BMI is computed with the same formula as the app's own generated column
(database/schema.sql: weight_kg / POW(height_cm/100, 2)), so a trained model and the live app
agree on what "BMI" means for the same person.
"""

import pandas as pd

from config import GENDER_MAP


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["age_years"] = (df["age"] / 365.25).round(1)
    df["height_cm"] = df["height"].astype(float)
    df["weight_kg"] = df["weight"].astype(float)
    df["bmi"] = (df["weight_kg"] / (df["height_cm"] / 100) ** 2).round(2)
    df["pulse_pressure"] = df["ap_hi"] - df["ap_lo"]
    df["map_pressure"] = (df["ap_lo"] + df["pulse_pressure"] / 3).round(1)  # mean arterial pressure
    df["gender"] = df["gender"].map(GENDER_MAP)
    if df["gender"].isnull().any():
        raise ValueError("Unexpected gender value outside the documented {1, 2} encoding")
    return df


def drop_bmi_outliers(df: pd.DataFrame, lo: float = 14.0, hi: float = 60.0) -> pd.DataFrame:
    """Height and weight are each individually plausible (cleaner.py's per-column ranges) but can
    still combine into an impossible BMI - e.g. 122cm/161kg -> BMI 108. Caught here because BMI
    only exists after engineer_features(). [14, 60] is deliberately wide (covers real severe
    underweight/obesity) and only removes ~0.1% of rows; see docs/ml-methodology.md for the count
    from the run that produced the saved model."""
    return df[(df["bmi"] >= lo) & (df["bmi"] <= hi)].reset_index(drop=True)
