"""Admin routes. Every route requires the ADMIN role (re-checked against the database on each request).

Statistics are aggregates only. User endpoints expose account metadata, never health data.
Every state-changing action writes an audit-log entry (see services/admin_service.py).
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import require_admin
from app.models import User
from app.schemas.admin import (
    AdminUserOut, AdminUserPage, AuditLogPage, MLModelOut, OverviewOut, RiskStatsOut, TrendsOut, UsageOut, UserStatusUpdate,
)
from app.services import admin_service

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/users", response_model=AdminUserPage)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=100),
    status_filter: Optional[Literal["active", "inactive"]] = Query(None, alias="status"),
    role: Optional[Literal["USER", "ADMIN"]] = Query(None),
    db: Session = Depends(get_db),
):
    """Account data only. Health data is deliberately not exposed here."""
    stmt = admin_service.search_users(db, search, status_filter, role)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.created_at.desc(), User.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return AdminUserPage(items=rows, total=total, page=page, page_size=page_size)


@router.patch("/users/{user_id}/status", response_model=AdminUserOut)
def set_user_status(
    user_id: int, body: UserStatusUpdate, request: Request,
    admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Activate or deactivate an account. A deactivated user is rejected on their next request, login and token refresh.
    Admins cannot change their own status, which also guarantees the system always keeps at least one active admin."""
    return admin_service.set_user_status(db, admin, request, user_id, body.is_active, body.reason)


@router.get("/stats/overview", response_model=OverviewOut)
def stats_overview(db: Session = Depends(get_db)):
    return admin_service.overview(db)


@router.get("/stats/risk", response_model=RiskStatsOut)
def stats_risk(db: Session = Depends(get_db)):
    return admin_service.risk_stats(db)


@router.get("/stats/trends", response_model=TrendsOut)
def stats_trends(days: int = Query(30, ge=7, le=365), db: Session = Depends(get_db)):
    return admin_service.trends(db, days)


@router.get("/stats/usage", response_model=UsageOut)
def stats_usage(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    return admin_service.usage(db, days)


@router.get("/ml/model", response_model=MLModelOut)
def ml_model(db: Session = Depends(get_db)):
    return admin_service.ml_model(db)


@router.get("/audit-logs", response_model=AuditLogPage)
def audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None, max_length=100),
    admin_id: Optional[int] = Query(None, ge=1),
    outcome: Optional[Literal["SUCCESS", "FAILED"]] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    items, total = admin_service.list_audit_logs(db, page, page_size, action_type, admin_id, outcome)
    return AuditLogPage(items=items, total=total, page=page, page_size=page_size)
