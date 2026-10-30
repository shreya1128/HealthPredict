"""Data cleaning: remove duplicates and physiologically implausible values.

The raw dataset has NO missing values (verified: 0 nulls across all 70,000 rows) but does have
real data-entry errors - e.g. systolic readings up to 16020 mmHg, diastolic as low as -70, and
1,234 rows where systolic < diastolic (physiologically impossible). See docs/ml-methodology.md
for the exact before/after row counts from the run that produced the saved model.
"""

import pandas as pd

from config import RANGES


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop(columns=["id"]).drop_duplicates().copy()

    for col, (lo, hi) in [("height", RANGES["height_cm"]), ("weight", RANGES["weight_kg"]),
                          ("ap_hi", RANGES["ap_hi"]), ("ap_lo", RANGES["ap_lo"])]:
        df = df[(df[col] >= lo) & (df[col] <= hi)]

    # Systolic must exceed diastolic - re-checked after range filtering, since clipping can
    # itself create new (still-invalid) ties or reversals at the boundary.
    df = df[df["ap_hi"] > df["ap_lo"]]

    return df.reset_index(drop=True)
