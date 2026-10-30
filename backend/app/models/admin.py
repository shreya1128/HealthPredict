"""Admin audit log. Mirrors the existing `admin_audit_logs` table in database/schema.sql."""

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, Text

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    admin_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(100), nullable=False)
    target_entity_type = Column(String(100))
    target_entity_id = Column(PK)
    old_values = Column(JSON)
    new_values = Column(JSON)
    details = Column(Text)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    status = Column(String(10), default="SUCCESS")  # SUCCESS | FAILED
    created_at = Column(DateTime, default=utcnow)
