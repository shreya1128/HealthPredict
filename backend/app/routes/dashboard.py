from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope
from app.models import User
from app.schemas.dashboard import DashboardOut
from app.services import dashboard_service

router = APIRouter()


@router.get("", response_model=DashboardOut)
def get_dashboard(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_dashboard(db, scope)
