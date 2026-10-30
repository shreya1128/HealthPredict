"""Authentication business logic. Routes stay thin; everything testable lives here."""

import logging
from datetime import timedelta

from typing import Optional
from fastapi import HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.models import TokenType, User, UserProfile, UserRole, UserToken
from app.utils import email as email_util
from app.schemas.auth import RegisterRequest, TokenResponse, UserOut
from app.utils.security import (
    create_access_token, generate_opaque_token, hash_password, hash_token, verify_password,
)
from app.utils.timeutil import utcnow

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
INVALID_TOKEN = HTTPException(status.HTTP_400_BAD_REQUEST, "This link or token is invalid or has expired")


def _store_token(
    db: Session,
    user_id: int,
    token_type: str,
    lifetime: timedelta,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    device_name: Optional[str] = None,
) -> str:
    raw = generate_opaque_token()
    db.add(UserToken(
        user_id=user_id,
        token_hash=hash_token(raw),
        token_type=token_type,
        expires_at=utcnow() + lifetime,
        ip_address=ip_address,
        user_agent=user_agent,
        device_name=device_name,
    ))
    return raw


def _extract_device_info(request: Optional[Request]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    if not request:
        return None, None, None
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    device = "Web Browser"
    if ua:
        if "Expo" in ua or "okhttp" in ua or "CFNetwork" in ua:
            device = "Mobile App"
        elif "Mobile" in ua or "Android" in ua or "iPhone" in ua:
            device = "Mobile Browser"
        elif "Tablet" in ua or "iPad" in ua:
            device = "Tablet"
    return ip, ua, device


def register_user(db: Session, data: RegisterRequest) -> User:
    email = data.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        email=email, password_hash=hash_password(data.password), full_name=data.full_name,
        phone=data.phone, date_of_birth=data.date_of_birth, gender=data.gender,
        timezone=getattr(data, "timezone", "UTC") or "UTC", role=UserRole.USER,
    )
    user.profile = UserProfile()
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # two simultaneous registrations with the same email
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # Email-verification: send a real email (works with MailHog in dev)
    raw = _store_token(db, user.id, TokenType.EMAIL_VERIFY, timedelta(days=2))
    db.commit()
    email_util.send_welcome(to=user.email, full_name=user.full_name, token=raw)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    # Always run a bcrypt check (against a dummy hash if no user) so timing doesn't leak existence.
    if not verify_password(password, user.password_hash if user else None):
        raise INVALID_CREDENTIALS
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    user.last_login = utcnow()
    db.commit()
    return user


def issue_tokens(db: Session, user: User, request: Optional[Request] = None) -> TokenResponse:
    access, expires_in = create_access_token(user.id, user.role)
    ip, ua, device = _extract_device_info(request)
    refresh = _store_token(
        db,
        user.id,
        TokenType.REFRESH,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=ip,
        user_agent=ua,
        device_name=device,
    )
    db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh, expires_in=expires_in,
                         user=UserOut.model_validate(user))


def create_totp_challenge(db: Session, user: User) -> str:
    """Create a temporary single-use token for completing 2FA login."""
    raw = _store_token(db, user.id, "TOTP_LOGIN", timedelta(minutes=5))
    db.commit()
    return raw


def verify_totp_login(db: Session, temp_token: str, code: str, request: Optional[Request] = None) -> TokenResponse:
    """Verify TOTP code against user's secret using temporary challenge token."""
    from app.utils.totp import verify_totp_code
    tok = _find_token(db, temp_token, "TOTP_LOGIN")
    if tok is None or not tok.is_usable():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired 2FA session. Please log in again.")
    user = db.get(User, tok.user_id)
    if not user or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA is not enabled or user not found.")
    
    if not verify_totp_code(user.totp_secret, code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid 2FA verification code.")

    tok.used_at = utcnow()
    tok.revoked = True
    return issue_tokens(db, user, request=request)


def _find_token(db: Session, raw: str, token_type: str) -> UserToken | None:
    return db.scalar(select(UserToken).where(
        UserToken.token_hash == hash_token(raw), UserToken.token_type == token_type))


def _revoke_all_refresh(db: Session, user_id: int) -> None:
    db.execute(update(UserToken).where(
        UserToken.user_id == user_id, UserToken.token_type == TokenType.REFRESH,
        UserToken.revoked.is_(False)).values(revoked=True))


def refresh_session(db: Session, raw_refresh: str) -> TokenResponse:
    tok = _find_token(db, raw_refresh, TokenType.REFRESH)
    if tok is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    if tok.revoked:
        # A rotated/revoked token was presented again: assume theft, kill every session for this user.
        _revoke_all_refresh(db, tok.user_id)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    if not tok.is_usable():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    user = db.get(User, tok.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please log in again.")
    tok.revoked = True  # rotation: each refresh token works exactly once
    return issue_tokens(db, user)


def logout(db: Session, raw_refresh: str) -> None:
    """Idempotent. Note: the short-lived access token stays valid until it expires."""
    tok = _find_token(db, raw_refresh, TokenType.REFRESH)
    if tok and not tok.revoked:
        tok.revoked = True
        db.commit()


def request_password_reset(db: Session, email: str) -> None:
    """Never reveals whether the email exists; callers always return the same message."""
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not user.is_active:
        return
    raw = _store_token(db, user.id, TokenType.PASSWORD_RESET,
                       timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES))
    db.commit()
    email_util.send_password_reset(to=user.email, full_name=user.full_name, token=raw)


def reset_password(db: Session, raw_token: str, new_password: str) -> None:
    tok = _find_token(db, raw_token, TokenType.PASSWORD_RESET)
    if tok is None or not tok.is_usable():
        raise INVALID_TOKEN
    user = db.get(User, tok.user_id)
    if not user:
        raise INVALID_TOKEN
    user.password_hash = hash_password(new_password)
    tok.used_at = utcnow()
    _revoke_all_refresh(db, user.id)  # sign out everywhere after a password change
    db.commit()


def verify_email(db: Session, raw_token: str) -> None:
    tok = _find_token(db, raw_token, TokenType.EMAIL_VERIFY)
    if tok is None or not tok.is_usable():
        raise INVALID_TOKEN
    user = db.get(User, tok.user_id)
    if not user:
        raise INVALID_TOKEN
    user.email_verified = True
    tok.used_at = utcnow()
    db.commit()
