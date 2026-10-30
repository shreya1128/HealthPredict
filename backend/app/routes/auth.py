from datetime import datetime, timezone
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import JSONResponse, Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.middleware.auth import get_current_user
from app.models import TokenBlocklist, User
from app.schemas.auth import (
    AccountDeleteRequest, ChangeEmailRequest, ChangePasswordRequest,
    ConfirmEmailChangeRequest, ForgotPasswordRequest, LoginRequest, MessageResponse,
    RefreshRequest, RegisterRequest, ResetPasswordRequest, SessionOut,
    TokenResponse, TOTPDisableRequest, TOTPEnableRequest, TOTPLoginRequest, TOTPSetupResponse,
    TOTPVerifyRequest, UserOut, VerifyEmailRequest,
)
from app.services import account_service, auth_service
from app.utils.rate_limiter import rate_limit_auth
from app.utils.security import decode_access_token

router = APIRouter()


def _set_auth_cookies(response: Response, tokens: TokenResponse):
    """Sets HttpOnly access and refresh tokens, and readable double-submit CSRF token."""
    csrf_token = secrets.token_hex(24)
    if tokens.access_token:
        response.set_cookie(
            key="access_token",
            value=tokens.access_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            max_age=tokens.expires_in,
            path="/",
        )
    if tokens.refresh_token:
        response.set_cookie(
            key="refresh_token",
            value=tokens.refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            path="/",
        )
    # Double-submit CSRF token (accessible by JavaScript)
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    response.delete_cookie(key="csrf_token", path="/")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit_auth)])
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    return auth_service.register_user(db, data)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = auth_service.authenticate(db, data.email, data.password)
    
    # Check if TOTP is enabled
    if user.totp_enabled:
        temp_token = auth_service.create_totp_challenge(db, user)
        return TokenResponse(
            totp_required=True,
            temp_token=temp_token,
            message="Two-factor authentication code required.",
        )

    tokens = auth_service.issue_tokens(db, user, request=request)
    _set_auth_cookies(response, tokens)
    return tokens


@router.post("/login/totp", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def login_totp(data: TOTPLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    tokens = auth_service.verify_totp_login(db, data.temp_token, data.code, request=request)
    _set_auth_cookies(response, tokens)
    return tokens


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(rate_limit_auth)])
def refresh(
    request: Request,
    response: Response,
    data: Optional[RefreshRequest] = None,
    db: Session = Depends(get_db),
):
    # Support both explicit JSON body and HttpOnly cookie for refresh token
    raw_refresh = None
    if data and data.refresh_token:
        raw_refresh = data.refresh_token
    elif request and "refresh_token" in request.cookies:
        raw_refresh = request.cookies.get("refresh_token")

    if not raw_refresh:
        from fastapi import HTTPException
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token required")

    tokens = auth_service.refresh_session(db, raw_refresh)
    if response:
        _set_auth_cookies(response, tokens)
    return tokens


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    data: Optional[RefreshRequest] = None,
    db: Session = Depends(get_db),
):
    raw_refresh = data.refresh_token if data else request.cookies.get("refresh_token")
    if raw_refresh:
        auth_service.logout(db, raw_refresh)

    raw_token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header[7:].strip()
    elif "access_token" in request.cookies:
        raw_token = request.cookies.get("access_token")

    if raw_token:
        payload = decode_access_token(raw_token)
        if payload and payload.get("jti"):
            exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
            TokenBlocklist.revoke(db, jti=payload["jti"], user_id=int(payload["sub"]), expires_at=exp)

    _clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


@router.post("/forgot-password", response_model=MessageResponse, dependencies=[Depends(rate_limit_auth)])
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    auth_service.request_password_reset(db, data.email)
    return MessageResponse(message="If an account exists for that email, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse, dependencies=[Depends(rate_limit_auth)])
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    auth_service.reset_password(db, data.token, data.password)
    return MessageResponse(message="Password updated. Please log in with your new password.")


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    auth_service.verify_email(db, data.token)
    return MessageResponse(message="Email verified")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ============================================================================
# GROUP 6: ACCOUNT, SESSIONS & SECURITY CENTER ENDPOINTS
# ============================================================================

@router.delete("/account", response_model=MessageResponse)
def delete_account(
    data: AccountDeleteRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user account and all owned health data permanently."""
    account_service.delete_account(db, user, data.password)
    _clear_auth_cookies(response)
    return MessageResponse(message="Account successfully and permanently deleted.")


@router.get("/account/export")
def export_account_data(
    format: str = Query("json", pattern=r"^(json|zip)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export complete patient records across all profiles as JSON or ZIP of CSVs."""
    if format == "zip":
        zip_bytes = account_service.export_account_zip(db, user)
        filename = f"healthpredict_export_user_{user.id}.zip"
        return FastAPIResponse(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    data = account_service.export_account_data(db, user)
    return data


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all active sessions with device and location info."""
    current_token = request.cookies.get("refresh_token")
    return account_service.list_user_sessions(db, user, current_token_raw=current_token)


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
def revoke_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke a specific active session."""
    account_service.revoke_session(db, user, session_id)
    return MessageResponse(message="Session revoked successfully.")


@router.post("/sessions/revoke-all", response_model=MessageResponse)
def revoke_all_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke all sessions except the current one."""
    current_token = request.cookies.get("refresh_token")
    count = account_service.revoke_all_sessions(db, user, current_token_raw=current_token)
    return MessageResponse(message=f"Revoked {count} other active session(s).")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    data: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user password and revoke all existing sessions."""
    account_service.change_password(db, user, data.current_password, data.new_password)
    _clear_auth_cookies(response)
    return MessageResponse(message="Password changed successfully. Please log in again.")


@router.post("/change-email", response_model=MessageResponse)
def change_email_request(
    data: ChangeEmailRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Request email address change. Sends verification link to new email."""
    account_service.change_email_request(db, user, data.new_email, data.password)
    return MessageResponse(message="Verification link has been sent to your new email address.")


@router.post("/confirm-email-change", response_model=MessageResponse)
def confirm_email_change(
    data: ConfirmEmailChangeRequest,
    db: Session = Depends(get_db),
):
    """Confirm new email address with verification token."""
    new_email = account_service.confirm_email_change(db, data.token)
    return MessageResponse(message=f"Email address successfully updated to {new_email}.")


@router.post("/totp/setup", response_model=TOTPSetupResponse)
def setup_totp(user: User = Depends(get_current_user)):
    """Generate TOTP secret and QR URL."""
    secret, otpauth_url = account_service.setup_totp(user)
    return TOTPSetupResponse(secret=secret, otpauth_url=otpauth_url)


@router.post("/totp/enable", response_model=MessageResponse)
def enable_totp(
    data: TOTPEnableRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enable TOTP on account after verifying a code."""
    from fastapi import HTTPException
    from app.utils.security import verify_password
    secret = (data.secret or data.password or "").strip()
    if not secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Secret required to enable 2FA")
    if verify_password(secret, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The 2FA secret is required, not your account password. Please re-run the 2FA setup step.",
        )
    db_user = db.get(User, user.id)
    account_service.enable_totp(db, db_user, secret, data.code)
    return MessageResponse(message="Two-factor authentication successfully enabled.")


@router.post("/totp/disable", response_model=MessageResponse)
def disable_totp(
    data: TOTPDisableRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable TOTP two-factor authentication."""
    db_user = db.get(User, user.id)
    account_service.disable_totp(db, db_user, data.password, data.code)
    return MessageResponse(message="Two-factor authentication has been disabled.")

