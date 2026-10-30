"""FastAPI dependencies for authentication and role-based authorization."""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models import TokenBlocklist, User
from app.utils.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)
_UNAUTHENTICATED = HTTPException(
    status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"}
)


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    raw_token = None
    if creds is not None and creds.credentials:
        raw_token = creds.credentials
    elif request and "access_token" in request.cookies:
        raw_token = request.cookies.get("access_token")

    if not raw_token:
        raise _UNAUTHENTICATED

    payload = decode_access_token(raw_token)
    if payload is None:
        raise _UNAUTHENTICATED

    jti = payload.get("jti")
    if jti and TokenBlocklist.is_revoked(db, jti):
        raise _UNAUTHENTICATED

    user = db.get(User, int(payload["sub"]))
    # Role and active flag are read from the database on every request, not trusted from the token,
    # so deactivating or demoting a user takes effect immediately.
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user


def get_current_user_optional(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    try:
        return get_current_user(request, creds, db)
    except HTTPException:
        return None
