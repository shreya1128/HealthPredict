"""Response/request models for the admin API. Everything here is account metadata or AGGREGATED statistics:
no individual's health measurements are ever exposed through admin endpoints."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import UserOut


class AdminUserOut(UserOut):
    last_login: Optional[datetime] = None


class AdminUserPage(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class UserStatusUpdate(BaseModel):
    is_active: bool
    reason: Optional[str] = Field(default=None, max_length=500)


class UserCounts(BaseModel):
    total: int
    active: int
    inactive: int
    admins: int
    new_last_7_days: int
    new_last_30_days: int
    signed_in_last_7_days: int
    signed_in_last_30_days: int
    never_signed_in: int


class AssessmentCounts(BaseModel):
    total: int
    last_7_days: int
    last_30_days: int
    predictions_total: int


class OverviewOut(BaseModel):
    users: UserCounts
    assessments: AssessmentCounts
    generated_at: datetime


class RiskDistribution(BaseModel):
    LOW: int = 0
    MODERATE: int = 0
    HIGH: int = 0


class RiskStatsOut(BaseModel):
    """Based on each member's LATEST assessment, so a person is counted once."""
    members_with_assessment: int
    members_without_assessment: int
    rule_based: RiskDistribution
    average_health_score: Optional[float] = None
    ml: RiskDistribution
    members_with_ml_prediction: int
    average_ml_probability: Optional[float] = None


class TrendPoint(BaseModel):
    date: date
    new_users: int
    assessments: int
    predictions: int


class TrendsOut(BaseModel):
    days: int
    points: list[TrendPoint]


class FeatureUsage(BaseModel):
    feature: str
    records: int
    users: int


class UsageOut(BaseModel):
    days: int
    features: list[FeatureUsage]
    medication_scheduled: int
    medication_taken: int
    medication_skipped: int
    medication_missed: int
    medication_adherence_percent: Optional[float] = None


class ModelMetrics(BaseModel):
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    roc_auc: Optional[float] = None


class ConfusionMatrix(BaseModel):
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int


class CandidateModel(BaseModel):
    """One row of the 4-model comparison: cross-validated mean +/- std (NOT the held-out test score)."""
    name: str
    metrics: dict[str, dict[str, float]]


class ModelStats(BaseModel):
    predictions_total: int
    average_probability: Optional[float] = None
    by_risk_level: RiskDistribution
    by_model_version: dict[str, int]


class MLModelOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    available: bool
    serving_model_loaded: bool
    model_name: Optional[str] = None
    trained_at_utc: Optional[str] = None
    hyperparameters: dict = {}
    feature_columns: list[str] = []
    dataset_counts: dict[str, int] = {}
    train_rows: Optional[int] = None
    test_rows: Optional[int] = None
    training_duration_seconds: Optional[float] = None
    test_metrics: Optional[ModelMetrics] = None
    confusion_matrix: Optional[ConfusionMatrix] = None
    comparison: list[CandidateModel] = []
    usage: ModelStats
    note: Optional[str] = None


class AuditLogOut(BaseModel):
    id: int
    admin_id: int
    admin_email: Optional[str] = None
    admin_name: Optional[str] = None
    action_type: str
    target_entity_type: Optional[str] = None
    target_entity_id: Optional[int] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int
