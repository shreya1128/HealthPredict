"""Token blocklist model for stateless access token revocation."""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String
from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class TokenBlocklist(Base):
    __tablename__ = "token_blocklist"

    id = Column(PK, primary_key=True, autoincrement=True)
    jti = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(PK, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    @classmethod
    def is_revoked(cls, db, jti: str) -> bool:
        if not jti:
            return False
        row = db.query(cls).filter(cls.jti == jti).first()
        return row is not None

    @classmethod
    def revoke(cls, db, jti: str, user_id: int, expires_at: datetime) -> "TokenBlocklist":
        if not jti:
            return None
        existing = db.query(cls).filter(cls.jti == jti).first()
        if existing:
            return existing
        try:
            item = cls(jti=jti, user_id=user_id, expires_at=expires_at)
            db.add(item)
            db.commit()
            return item
        except Exception:
            db.rollback()
            return db.query(cls).filter(cls.jti == jti).first()

    @classmethod
    def purge_expired(cls, db) -> int:
        """Remove blocklist entries whose tokens have already expired (no longer needed)."""
        now = utcnow()
        result = db.query(cls).filter(cls.expires_at < now).delete()
        db.commit()
        return result
