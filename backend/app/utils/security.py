"""Password hashing, JWT access tokens and opaque (hashed-at-rest) tokens."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config.settings import settings

# A valid bcrypt hash of a random value; failed lookups verify against it so that
# "unknown email" and "wrong password" take about the same time.
_DUMMY_HASH = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    stored = password_hash.encode() if password_hash else _DUMMY_HASH
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), stored)
    except ValueError:
        return False
    return ok and password_hash is not None


def create_access_token(user_id: int, role: str) -> tuple[str, int]:
    """Returns (token, expires_in_seconds)."""
    now = datetime.now(timezone.utc)
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jti = secrets.token_hex(16)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "jti": jti,
        "iat": now,
        "exp": now + expires,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires.total_seconds())


def decode_access_token(token: str) -> dict | None:
    """Returns the payload, or None if invalid/expired/not an access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == "access" else None


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """SHA-256 hex digest; only this is stored in the database."""
    return hashlib.sha256(token.encode()).hexdigest()
