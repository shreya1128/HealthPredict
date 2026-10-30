"""The four required model families, each as (estimator, hyperparameter grid for tuning).

Gradient Boosting uses scikit-learn's own GradientBoostingClassifier rather than XGBoost/LightGBM:
it satisfies the "gradient boosting" requirement without an extra native-code dependency, and
keeps ml/requirements.txt to versions actually installed and tested in this environment. XGBoost/
LightGBM would be a reasonable future addition (noted in docs/ml-methodology.md) but were not
necessary to meet the project's requirements.
"""

from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier

from config import RANDOM_STATE

# n_jobs deliberately omitted (defaults to 1): this environment has a single CPU core, where
# sklearn's parallelism has no core to run on and was measured to add overhead rather than
# remove it. Base n_estimators are kept modest (100) so screening fits stay fast; tuning
# explores larger values for the winning model family only.
MODEL_DEFINITIONS = {
    "logistic_regression": {
        "estimator": LogisticRegression(max_iter=1000, random_state=RANDOM_STATE),
        "param_grid": {"model__C": [0.1, 1.0, 10.0]},
    },
    "decision_tree": {
        "estimator": DecisionTreeClassifier(random_state=RANDOM_STATE),
        "param_grid": {"model__max_depth": [4, 6, 8], "model__min_samples_leaf": [10, 25, 50]},
    },
    "random_forest": {
        "estimator": RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE),
        "param_grid": {"model__n_estimators": [100, 200], "model__max_depth": [6, 10, None]},
    },
    "gradient_boosting": {
        "estimator": GradientBoostingClassifier(n_estimators=100, random_state=RANDOM_STATE),
        "param_grid": {"model__n_estimators": [100, 150], "model__max_depth": [2, 3]},
    },
}
