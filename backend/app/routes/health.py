from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.models import User
from app.schemas.health import (
    AssessmentCreate, AssessmentOut, AssessmentPage, AssessmentSummary, HistoryOut, HistoryPoint,
)
from app.services import health_service

router = APIRouter()


@router.post("/assessment", response_model=AssessmentOut, status_code=201)
def create_assessment(
    data: AssessmentCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    assessment = health_service.create_assessment(db, scope, data)
    return health_service.to_out_dict(assessment, scope.caller_user, is_primary=scope.profile.is_primary)


@router.get("/assessment/history", response_model=AssessmentPage)
def list_assessments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    rows, total = health_service.list_assessments(db, scope, page, page_size)
    return AssessmentPage(items=[AssessmentSummary.model_validate(r) for r in rows],
                          total=total, page=page, page_size=page_size)


@router.get("/assessment/latest", response_model=AssessmentOut)
def latest_assessment(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    a = health_service.get_latest_assessment(db, scope)
    if a is None:
        from fastapi import HTTPException
        raise HTTPException(404, "No assessments yet")
    return health_service.to_out_dict(a, scope.caller_user, is_primary=scope.profile.is_primary)


@router.get("/assessment/{assessment_id}", response_model=AssessmentOut)
def get_assessment(
    assessment_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    a = health_service.get_assessment(db, scope, assessment_id)
    return health_service.to_out_dict(a, scope.caller_user, is_primary=scope.profile.is_primary)


@router.post("/assessment/recalculate-latest", response_model=AssessmentOut)
def recalculate_latest_assessment(
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    latest = health_service.get_latest_assessment(db, scope)
    if latest is None:
        from fastapi import HTTPException
        raise HTTPException(404, "No assessments found to recalculate")
    a = health_service.recalculate_assessment(db, scope.caller_user, latest.id)
    return health_service.to_out_dict(a, scope.caller_user, is_primary=scope.profile.is_primary)


@router.post("/assessment/{assessment_id}/recalculate", response_model=AssessmentOut)
def recalculate_assessment(
    assessment_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    a = health_service.recalculate_assessment(db, scope.caller_user, assessment_id)
    return health_service.to_out_dict(a, scope.caller_user, is_primary=scope.profile.is_primary)


@router.get("/history", response_model=HistoryOut)
def get_history(
    days: int = Query(30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    rows = health_service.get_history(db, scope, days)
    return HistoryOut(days=days, points=[HistoryPoint.model_validate(r) for r in rows])

