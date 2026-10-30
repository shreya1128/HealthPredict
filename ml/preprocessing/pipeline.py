"""Builds the sklearn preprocessing step shared by every model.

Continuous features are standardized; categorical/ordinal/binary features pass through unscaled
(see docs/ml-methodology.md for why: cholesterol/gluc are ordinal, gender/smoke/alco/active are
binary, and none benefit from centering). Wrapping this in a ColumnTransformer - rather than a
hand-saved StandardScaler pickle plus a separately-remembered feature order - means preprocessing
and the model are ONE saved artifact (see training/train.py), which removes the classic
train/serve skew bug where inference uses a different feature order or scaling than training.
"""

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler

from config import CATEGORICAL_FEATURES, CONTINUOUS_FEATURES


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("scale", StandardScaler(), CONTINUOUS_FEATURES),
            ("passthrough", "passthrough", CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )
