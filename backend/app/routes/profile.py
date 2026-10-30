from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.models import User, UserProfile
from app.schemas.auth import UserOut
from app.schemas.profile import ProfileOut, ProfileUpdate

router = APIRouter()

USER_FIELDS = {"full_name", "phone", "date_of_birth", "gender", "timezone"}


class _ProfileResponse(ProfileOut):
    user: UserOut


def _build(user: User) -> dict:
    return {"user": UserOut.model_validate(user), **ProfileOut.model_validate(user.profile).model_dump()}


@router.get("", response_model=_ProfileResponse)
def get_profile(user: User = Depends(get_current_user)):
    return _build(user)


@router.put("", response_model=_ProfileResponse)
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True)
    if user.profile is None:
        user.profile = UserProfile()
    for field, value in changes.items():
        setattr(user if field in USER_FIELDS else user.profile, field, value)
    db.commit()
    db.refresh(user)
    db.refresh(user.profile)  # re-read so the DB-generated BMI is returned
    return _build(user)
