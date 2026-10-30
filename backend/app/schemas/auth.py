"""Auth request/response schemas (pydantic v2)."""

from datetime import date, datetime
import re
from typing import Annotated, Literal, Optional

from pydantic import (
    BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator,
)

SPECIALS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

# Login/forgot-password accept any well-formed address (trimmed, lowercased). We deliberately do NOT use
# EmailStr here: it rejects reserved domains such as ".local", which would lock out the seeded
# development accounts. Strict validation still applies to new registrations.
LoginEmail = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=255,
                      pattern=r"^[^@\s]+@[^@\s]+$"),
]


def validate_password_strength(v: str) -> str:
    """One password rule, used for registration and password reset."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")  # bcrypt limit
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain an uppercase letter")
    if not any(c.islower() for c in v):
        raise ValueError("Password must contain a lowercase letter")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain a digit")
    if not any(c in SPECIALS for c in v):
        raise ValueError("Password must contain a special character")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    date_of_birth: Optional[date] = None
    gender: Literal["MALE", "FEMALE", "OTHER"] = "OTHER"
    timezone: Optional[str] = Field(default="UTC", max_length=64)

    _pw = field_validator("password")(validate_password_strength)

    @field_validator("timezone")
    @classmethod
    def _validate_tz(cls, v: Optional[str]) -> str:
        if not v:
            return "UTC"
        v = v.strip()
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(v)
        except Exception:
            raise ValueError(f"Invalid IANA timezone: '{v}'")
        return v

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        # Strip HTML tags and angle brackets to prevent stored XSS
        v = re.sub(r'<[^>]*>', '', v).strip()
        v = v.replace('<', '').replace('>', '').strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def _dob_sane(cls, v: Optional[date]) -> Optional[date]:
        if v is not None:
            if v > date.today():
                raise ValueError("Date of birth cannot be in the future")
            if v.year < 1900:
                raise ValueError("Date of birth is not valid")
        return v

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginRequest(BaseModel):
    email: LoginEmail
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: LoginEmail


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
    confirm_password: str

    _pw = field_validator("password")(validate_password_strength)

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class VerifyEmailRequest(BaseModel):
    token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str  # already validated at registration; never re-validate stored data
    full_name: str
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    role: str
    is_active: bool
    email_verified: bool
    totp_enabled: bool = False
    timezone: str = "UTC"
    created_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 0
    user: Optional[UserOut] = None
    totp_required: bool = False
    temp_token: Optional[str] = None


class MessageResponse(BaseModel):
    message: str


class AccountDeleteRequest(BaseModel):
    password: str
    confirm_phrase: str = "DELETE"

    @field_validator("confirm_phrase")
    @classmethod
    def _must_match_delete(cls, v: str) -> str:
        if v.strip().upper() != "DELETE":
            raise ValueError("Confirmation phrase must be DELETE")
        return v.strip().upper()


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str


class ConfirmEmailChangeRequest(BaseModel):
    token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str

    _pw = field_validator("new_password")(validate_password_strength)

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.new_password != self.confirm_new_password:
            raise ValueError("New passwords do not match")
        return self


class TOTPSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class TOTPVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TOTPEnableRequest(BaseModel):
    secret: Optional[str] = None
    password: Optional[str] = None  # backward-compatibility with older clients
    code: str = Field(min_length=6, max_length=6)


class TOTPLoginRequest(BaseModel):
    temp_token: str
    code: str = Field(min_length=6, max_length=6)


class TOTPDisableRequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=6)


class SessionOut(BaseModel):
    id: int
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    is_current: bool = False

