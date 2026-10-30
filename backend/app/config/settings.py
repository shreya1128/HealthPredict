"""Application settings, loaded from environment variables / .env (pydantic-settings)."""

import logging
import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=True)

    APP_NAME: str = "HealthPredict API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"          # development | testing | production
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/healthpredict"
    DB_ECHO: bool = False

    # Security. No usable default: production must set it; development gets an ephemeral key.
    SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    BCRYPT_ROUNDS: int = 12

    # Comma-separated in .env, e.g. CORS_ORIGINS=http://localhost:5173,http://localhost:8081
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081"

    # Rate limiting for auth endpoints (per client IP)
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_RATE_LIMIT: int = 10
    LOGIN_RATE_WINDOW_SECONDS: int = 60
    REDIS_URL: str = ""  # If set, rate limiter uses distributed Redis
    COOKIE_SECURE: bool = False  # Set to True in production (HTTPS)

    # Seed / demo accounts. Passwords come from the environment, never from source code.
    ADMIN_EMAIL: str = "admin@healthpredict.local"
    ADMIN_PASSWORD: str = ""
    DEMO_EMAIL: str = "demo@healthpredict.local"
    DEMO_PASSWORD: str = ""
    SEED_DEMO_DATA: bool = False
    # In-process reminder scheduler. Keep ONE API worker, or set false on all but one worker
    # (each worker would otherwise run its own scheduler).
    ENABLE_BACKGROUND_SCHEDULER: bool = True
    REMINDER_INTERVAL_SECONDS: int = 60

    # External APIs and Feature Flags
    DRUG_INTERACTIONS_PROVIDER: str = "openfda"  # "openfda" | "nlm" | "custom"
    DRUG_INTERACTIONS_API_KEY: str = ""
    FEATURE_MEDICINE_SCAN: bool = False
    VISION_API_KEY: str = ""

    ML_MODEL_PATH: str = "../ml/saved_models"

    # Email (SMTP / Cloud API) — defaults work with MailHog in docker-compose
    EMAIL_BACKEND: str = "smtp"  # "smtp" | "memory" | "console"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = False
    SMTP_SSL: bool = False
    SMTP_FROM: str = "noreply@healthpredict.local"
    RESEND_API_KEY: str = ""
    SENDGRID_API_KEY: str = ""
    APP_URL: str = "http://localhost:5173"  # Used in email links

    # Security & API exposure
    INTERNAL_API_KEY: str = ""  # Secret key for server-to-server or scheduler endpoints
    TRUSTED_PROXIES: str = ""  # Comma-separated list of trusted proxy IPs/CIDRs
    ENABLE_API_DOCS: bool = True  # Can be disabled in production

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def trusted_proxies_list(self) -> list[str]:
        return [p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()]

    @model_validator(mode="after")
    def _validate_security(self):
        if not self.SECRET_KEY:
            if self.ENVIRONMENT == "production":
                raise ValueError("SECRET_KEY must be set in production")
            self.SECRET_KEY = secrets.token_urlsafe(32)
            logger.warning("SECRET_KEY not set: using an ephemeral key (tokens reset on restart)")
        if self.ENVIRONMENT == "production":
            if self.EMAIL_BACKEND == "memory":
                raise ValueError("EMAIL_BACKEND cannot be 'memory' in production")
            if len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            weak_placeholders = {"changeme", "secret", "12345678", "default", "healthpredict", "password"}
            if any(p in self.SECRET_KEY.lower() for p in weak_placeholders) or len(set(self.SECRET_KEY)) < 8:
                raise ValueError(
                    "SECRET_KEY contains known weak placeholders or low entropy. "
                    "Use a cryptographically secure key: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            if self.DEBUG:
                raise ValueError(
                    "DEBUG must be False in production. Set DEBUG=false in your environment."
                )
            if not self.COOKIE_SECURE:
                raise ValueError(
                    "COOKIE_SECURE must be True in production (requires HTTPS). "
                    "Set COOKIE_SECURE=true in your environment."
                )
            if self.ENABLE_API_DOCS:
                raise ValueError(
                    "ENABLE_API_DOCS must be False in production. "
                    "Set ENABLE_API_DOCS=false in your environment."
                )
            if "*" in self.cors_origins_list or self.CORS_ORIGINS.strip() == "*":
                raise ValueError("Wildcard CORS ('*') is forbidden in production. Explicit trusted origins required.")
            if self.APP_URL and self.APP_URL.startswith("http://") and not ("localhost" in self.APP_URL or "127.0.0.1" in self.APP_URL):
                raise ValueError("APP_URL must use https:// in production.")
        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
