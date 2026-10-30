"""Load the raw Kaggle "Cardiovascular Disease dataset" (semicolon-separated). See
ml/dataset/README.md for provenance, and docs/ml-methodology.md for full documentation."""

import pandas as pd

from config import DATASET_PATH

RAW_COLUMNS = ["id", "age", "gender", "height", "weight", "ap_hi", "ap_lo",
              "cholesterol", "gluc", "smoke", "alco", "active", "cardio"]


def load_raw_data(path=DATASET_PATH) -> pd.DataFrame:
    df = pd.read_csv(path, sep=";")
    missing = set(RAW_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing expected columns: {missing}")
    return df
