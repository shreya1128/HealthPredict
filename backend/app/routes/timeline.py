"""Unified Personal Health Timeline API route.

Provides a consolidated, chronological feed of health assessments, predictions,
physical activity, sleep, hydration, nutrition, symptoms, and medication events.
"""

from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.profile_scope import ProfileScope, get_profile_scope
from app.services import timeline_service

router = APIRouter(prefix="/health/timeline", tags=["Timeline"])


@router.get("")
def get_timeline(
    start_date: Optional[date] = Query(None, description="Filter events from this date forward (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Filter events up to this date (YYYY-MM-DD)"),
    categories: Optional[List[str]] = Query(None, description="Categories to include: ASSESSMENT, EXERCISE, SLEEP, HYDRATION, NUTRITION, SYMPTOM, MEDICATION"),
    limit: int = Query(50, ge=1, le=200, description="Page size limit"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Retrieve chronological, multi-stream personal health timeline for the active profile."""
    return timeline_service.get_health_timeline(
        db=db,
        target=scope,
        start_date=start_date,
        end_date=end_date,
        categories=categories,
        limit=limit,
        offset=offset,
    )
