"""ORM models. Each phase adds the models for its own tables (matching database/schema.sql)."""

from app.models.admin import AdminAuditLog
from app.models.notification import Notification, NotificationType
from app.models.health import (
    AssessmentStatus, HealthAssessment, HealthHistory, HealthPrediction, MLModelInfo, RiskCategory,
)
from app.models.medicine import DrugInteractionCache, FrequencyUnit, Medicine, MedicineForm, MedicineIntakeLog, MedicineSchedule
from app.models.tracking import (
    ExerciseLog, GoalProgress, GoalStatus, GoalType, HydrationLog, Intensity, MealType, NutritionLog, SleepLog,
    WeeklyReport, WellnessGoal,
)
from app.models.care_profile import (
    CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus, RelationshipType,
)
from app.models.doctor_share import DoctorShare, DoctorShareNote
from app.models.emergency_and_symptoms import AppointmentStatus, DoctorAppointment, EmergencyCard, SymptomLog
from app.models.token_blocklist import TokenBlocklist
from app.models.user_device import UserDeviceToken
from app.models.user import TokenType, User, UserProfile, UserRole, UserToken
from app.models.diabetes import DiabetesScreening
from app.models.menstrual import MenstrualLog, PCOSScreening
from app.models.fatty_liver import FattyLiverScreening

__all__ = [
    "AdminAuditLog", "Notification", "NotificationType",
    "User", "UserProfile", "UserToken", "UserRole", "TokenType",
    "CareProfile", "CaregiverAccess", "CaregiverAccessLevel", "CaregiverInviteStatus", "RelationshipType",
    "DoctorShare", "DoctorShareNote", "TokenBlocklist",
    "EmergencyCard", "SymptomLog", "DoctorAppointment", "AppointmentStatus",
    "UserDeviceToken",
    "HealthAssessment", "HealthHistory", "RiskCategory", "AssessmentStatus", "HealthPrediction", "MLModelInfo",
    "Medicine", "MedicineSchedule", "MedicineIntakeLog", "MedicineForm", "FrequencyUnit", "DrugInteractionCache",
    "ExerciseLog", "SleepLog", "HydrationLog", "NutritionLog", "WellnessGoal", "GoalProgress", "WeeklyReport",
    "Intensity", "MealType", "GoalType", "GoalStatus",
    "DiabetesScreening",
    "MenstrualLog", "PCOSScreening",
    "FattyLiverScreening",
]


