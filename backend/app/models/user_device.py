from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK


class UserDeviceToken(Base):
    __tablename__ = "user_device_tokens"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    push_token = Column(String(255), nullable=False)
    p256dh = Column(String(255), nullable=True)
    auth = Column(String(255), nullable=True)
    platform = Column(String(20), default="expo", nullable=False)
    device_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", backref="device_tokens")
