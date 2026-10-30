"""Admin analytics and user management.

PRIVACY: every statistic here is an aggregate (counts, averages, distributions). No endpoint built on this
module returns an individual's health measurements. User records are account metadata only.

Definitions worth knowing:
  - "signed in" = users.last_login, which is set at login only. A session kept alive by refresh tokens
    without a fresh login is not counted, so this slightly understates activity.
  - Risk statistics use each member's LATEST assessment (one person = one count).
  - Dates/windows use UTC.
"""

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.config.ml_settings import ML_MODEL_INFO_PATH
from app.models import (
    AdminAuditLog, ExerciseLog, HealthAssessment, HealthPrediction, HydrationLog, Medicine, MedicineSchedule,
    NutritionLog, SleepLog, User, UserRole, WeeklyReport, WellnessGoal,
)
from app.utils.timeutil import utcnow

RISK_LEVELS = ("LOW", "MODERATE", "HIGH")


def _ago(days: int) -> datetime:
    return utcnow() - timedelta(days=days)


def _count(db: Session, stmt) -> int:
    return int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)


def _dist(rows) -> dict:
    out = {k: 0 for k in RISK_LEVELS}
    for level, n in rows:
        if level in out:
            out[level] = int(n)
    return out


# ------------------------------------------------------------------ overview
def overview(db: Session) -> dict:
    users = select(User)
    d7, d30 = _ago(7), _ago(30)
    assessments = select(HealthAssessment)
    return {
        "users": {
            "total": _count(db, users),
            "active": _count(db, users.where(User.is_active.is_(True))),
            "inactive": _count(db, users.where(User.is_active.is_(False))),
            "admins": _count(db, users.where(User.role == UserRole.ADMIN)),
            "new_last_7_days": _count(db, users.where(User.created_at >= d7)),
            "new_last_30_days": _count(db, users.where(User.created_at >= d30)),
            "signed_in_last_7_days": _count(db, users.where(User.last_login >= d7)),
            "signed_in_last_30_days": _count(db, users.where(User.last_login >= d30)),
            "never_signed_in": _count(db, users.where(User.last_login.is_(None))),
        },
        "assessments": {
            "total": _count(db, assessments),
            "last_7_days": _count(db, assessments.where(HealthAssessment.created_at >= d7)),
            "last_30_days": _count(db, assessments.where(HealthAssessment.created_at >= d30)),
            "predictions_total": _count(db, select(HealthPrediction)),
        },
        "generated_at": utcnow(),
    }


# ------------------------------------------------------------------ risk
def risk_stats(db: Session) -> dict:
    latest = (
        select(
            HealthAssessment.id.label("aid"), HealthAssessment.risk_category, HealthAssessment.health_score,
            func.row_number().over(
                partition_by=HealthAssessment.user_id,
                order_by=(HealthAssessment.assessment_date.desc(), HealthAssessment.id.desc()),
            ).label("rn"),
        )
        .join(User, User.id == HealthAssessment.user_id)
        .where(User.role == UserRole.USER)
        .subquery()
    )
    current = select(latest).where(latest.c.rn == 1).subquery()

    rule_rows = db.execute(select(current.c.risk_category, func.count()).group_by(current.c.risk_category)).all()
    with_assessment = sum(int(n) for _, n in rule_rows)
    avg_score = db.scalar(select(func.avg(current.c.health_score)))
    members = _count(db, select(User).where(User.role == UserRole.USER))

    ml_rows = db.execute(
        select(HealthPrediction.risk_level, func.count(), func.avg(HealthPrediction.prediction_score))
        .join(current, current.c.aid == HealthPrediction.assessment_id)
        .group_by(HealthPrediction.risk_level)
    ).all()
    with_ml = sum(int(n) for _, n, _ in ml_rows)
    weighted = sum(float(a or 0) * int(n) for _, n, a in ml_rows)
    return {
        "members_with_assessment": with_assessment,
        "members_without_assessment": max(members - with_assessment, 0),
        "rule_based": _dist(rule_rows),
        "average_health_score": round(float(avg_score), 1) if avg_score is not None else None,
        "ml": _dist([(lvl, n) for lvl, n, _ in ml_rows]),
        "members_with_ml_prediction": with_ml,
        "average_ml_probability": round(weighted / with_ml, 4) if with_ml else None,
    }


# ------------------------------------------------------------------ trends
def trends(db: Session, days: int) -> dict:
    start = utcnow().date() - timedelta(days=days - 1)

    def per_day(model, col) -> dict[date, int]:
        rows = db.execute(select(func.date(col), func.count()).where(col >= datetime.combine(start, datetime.min.time())).group_by(func.date(col))).all()
        return {(d if isinstance(d, date) else date.fromisoformat(str(d))): int(n) for d, n in rows}

    users_by_day = per_day(User, User.created_at)
    assess_by_day = per_day(HealthAssessment, HealthAssessment.created_at)
    pred_by_day = per_day(HealthPrediction, HealthPrediction.created_at)
    points = []
    for i in range(days):
        d = start + timedelta(days=i)
        points.append({"date": d, "new_users": users_by_day.get(d, 0), "assessments": assess_by_day.get(d, 0), "predictions": pred_by_day.get(d, 0)})
    return {"days": days, "points": points}


# ------------------------------------------------------------------ feature usage
def usage(db: Session, days: int) -> dict:
    since = _ago(days)
    sources = [
        ("Health assessments", HealthAssessment), ("Exercise logs", ExerciseLog), ("Sleep logs", SleepLog),
        ("Hydration logs", HydrationLog), ("Nutrition logs", NutritionLog), ("Medicines added", Medicine),
        ("Goals created", WellnessGoal), ("Weekly reports", WeeklyReport),
    ]
    features = []
    for label, model in sources:
        records, users = db.execute(
            select(func.count(), func.count(func.distinct(model.user_id))).where(model.created_at >= since)
        ).one()
        features.append({"feature": label, "records": int(records), "users": int(users)})

    today = utcnow().date()
    cutoff = today - timedelta(days=days - 1)
    taken, skipped, total, missed = db.execute(
        select(
            func.coalesce(func.sum(case((MedicineSchedule.is_taken.is_(True), 1), else_=0)), 0),
            func.coalesce(func.sum(case((MedicineSchedule.is_skipped.is_(True), 1), else_=0)), 0),
            func.count(),
            func.coalesce(func.sum(case(
                ((MedicineSchedule.is_taken.is_(False)) & (MedicineSchedule.is_skipped.is_(False)) & (MedicineSchedule.scheduled_date < today), 1), else_=0)), 0),
        )
        .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
        .join(User, User.id == Medicine.user_id)
        .where(Medicine.is_active.is_(True), User.is_active.is_(True),
               MedicineSchedule.scheduled_date >= cutoff, MedicineSchedule.scheduled_date <= today)
    ).one()
    return {
        "days": days, "features": features,
        "medication_scheduled": int(total), "medication_taken": int(taken),
        "medication_skipped": int(skipped), "medication_missed": int(missed),
        "medication_adherence_percent": round(int(taken) / int(total) * 100, 2) if total else None,
    }


# ------------------------------------------------------------------ ML model
def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def ml_model(db: Session) -> dict:
    """Metrics come from the artifacts written by ml/training (never typed in here), plus real usage from the DB."""
    info = _read_json(ML_MODEL_INFO_PATH)
    comparison = _read_json(ML_MODEL_INFO_PATH.parent / "model_comparison.json")

    pred_rows = db.execute(select(HealthPrediction.risk_level, func.count()).group_by(HealthPrediction.risk_level)).all()
    versions = db.execute(select(HealthPrediction.model_version, func.count()).group_by(HealthPrediction.model_version)).all()
    avg_prob = db.scalar(select(func.avg(HealthPrediction.prediction_score)))
    usage_block = {
        "predictions_total": sum(int(n) for _, n in pred_rows),
        "average_probability": round(float(avg_prob), 4) if avg_prob is not None else None,
        "by_risk_level": _dist(pred_rows),
        "by_model_version": {str(v or "unknown"): int(n) for v, n in versions},
    }

    try:
        from app.services import prediction_service
        loaded = bool(prediction_service._get_bundle().available)
    except Exception:  # model deps missing or artifact unreadable: report honestly, don't fail the page
        loaded = False

    if info is None:
        return {"available": False, "serving_model_loaded": loaded, "usage": usage_block,
                "note": "No model_info.json found. Run ml/training/train.py to create the model artifacts."}

    metrics = info.get("test_metrics") or {}
    cm = metrics.get("confusion_matrix")
    return {
        "available": True,
        "serving_model_loaded": loaded,
        "model_name": info.get("model_name"),
        "trained_at_utc": info.get("trained_at_utc"),
        "hyperparameters": info.get("hyperparameters") or {},
        "feature_columns": info.get("feature_columns") or [],
        "dataset_counts": info.get("dataset_counts") or {},
        "train_rows": info.get("train_rows"),
        "test_rows": info.get("test_rows"),
        "training_duration_seconds": info.get("training_duration_seconds"),
        "test_metrics": {k: metrics.get(k) for k in ("accuracy", "precision", "recall", "f1_score", "roc_auc")},
        "confusion_matrix": cm,
        "comparison": [{"name": n, "metrics": m} for n, m in (comparison or {}).items()],
        "usage": usage_block,
        "note": None if comparison else "model_comparison.json not found; the model comparison is unavailable.",
    }


# ------------------------------------------------------------------ audit log
def _client(request: Request) -> tuple[Optional[str], Optional[str]]:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return (ip[:45] if ip else None), (ua[:500] if ua else None)


def record_audit(db: Session, admin: User, request: Request, action: str, *, target_type: str = None, target_id: int = None,
                 old: dict = None, new: dict = None, details: str = None, outcome: str = "SUCCESS") -> AdminAuditLog:
    """Adds an audit row to the CURRENT transaction; the caller commits (so the change and its audit entry are atomic)."""
    ip, ua = _client(request)
    row = AdminAuditLog(admin_id=admin.id, action_type=action, target_entity_type=target_type, target_entity_id=target_id,
                        old_values=old, new_values=new, details=details, ip_address=ip, user_agent=ua, status=outcome)
    db.add(row)
    return row


def list_audit_logs(db: Session, page: int, page_size: int, action_type: Optional[str], admin_id: Optional[int], outcome: Optional[str]):
    stmt = select(AdminAuditLog, User.email, User.full_name).join(User, User.id == AdminAuditLog.admin_id)
    if action_type:
        stmt = stmt.where(AdminAuditLog.action_type == action_type)
    if admin_id:
        stmt = stmt.where(AdminAuditLog.admin_id == admin_id)
    if outcome:
        stmt = stmt.where(AdminAuditLog.status == outcome)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for log, email, name in rows:
        items.append({
            "id": log.id, "admin_id": log.admin_id, "admin_email": email, "admin_name": name, "action_type": log.action_type,
            "target_entity_type": log.target_entity_type, "target_entity_id": log.target_entity_id,
            "old_values": log.old_values, "new_values": log.new_values, "details": log.details,
            "ip_address": log.ip_address, "status": log.status, "created_at": log.created_at,
        })
    return items, int(total or 0)


# ------------------------------------------------------------------ user management
def set_user_status(db: Session, admin: User, request: Request, user_id: int, is_active: bool, reason: Optional[str]) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    action = "USER_REACTIVATED" if is_active else "USER_DEACTIVATED"

    def refuse(message: str):
        record_audit(db, admin, request, action, target_type="USER", target_id=target.id, details=f"Blocked: {message}", outcome="FAILED")
        db.commit()  # keep the record of the blocked attempt even though we are about to raise
        raise HTTPException(status.HTTP_400_BAD_REQUEST, message)

    if target.id == admin.id:
        refuse("You can't change the status of your own account.")
    if target.is_active == is_active:
        return target  # already in the requested state: nothing to change, nothing to audit
    old = {"is_active": bool(target.is_active)}
    target.is_active = is_active
    record_audit(db, admin, request, action, target_type="USER", target_id=target.id, old=old, new={"is_active": is_active},
                 details=(reason or "").strip() or None)
    db.commit()
    db.refresh(target)
    return target


def search_users(db: Session, search: Optional[str], status_filter: Optional[str], role: Optional[str]):
    stmt = select(User)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(User.full_name.like(like), User.email.like(like)))
    if status_filter:
        stmt = stmt.where(User.is_active.is_(status_filter == "active"))
    if role:
        stmt = stmt.where(User.role == role)
    return stmt
