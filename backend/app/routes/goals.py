from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.models import User
from app.schemas.tracking import (
    GoalCreate, GoalOut, GoalProgressCreate, GoalProgressOut, GoalRecommendationsOut, GoalStatusLiteral, GoalUpdate,
)
from app.services import goal_service

router = APIRouter()


@router.get("/recommendations", response_model=GoalRecommendationsOut)
def get_goal_recommendations(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return goal_service.get_recommended_goals(db, scope)



@router.post("", response_model=GoalOut, status_code=201)
def create_goal(
    data: GoalCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return goal_service.create_goal(db, scope, data)


@router.get("", response_model=list[GoalOut])
def list_goals(
    status: Optional[GoalStatusLiteral] = Query(None),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return goal_service.list_goals(db, scope, status)


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(
    goal_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return goal_service.get_goal(db, scope, goal_id)


@router.put("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    data: GoalUpdate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return goal_service.update_goal(db, scope, goal_id, data)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    goal_service.delete_goal(db, scope, goal_id)


@router.post("/{goal_id}/progress", response_model=GoalProgressOut, status_code=201)
def log_goal_progress(
    goal_id: int,
    data: GoalProgressCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return goal_service.log_progress(db, scope, goal_id, data)


@router.get("/{goal_id}/progress", response_model=list[GoalProgressOut])
def list_goal_progress(
    goal_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return goal_service.list_goal_progress(db, scope, goal_id)
