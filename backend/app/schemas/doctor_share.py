from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DoctorNotesSubmit(BaseModel):
    doctor_name: str = Field(..., min_length=1, max_length=255)
    doctor_notes: str = Field(..., min_length=1)
    doctor_recommendations: Optional[List[str]] = Field(default_factory=list)


class DoctorShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    share_url: str
    expires_at: str
    is_revoked: bool
    is_valid: bool
    created_at: str
    doctor_name: Optional[str] = None
    doctor_notes: Optional[str] = None
    doctor_reviewed_at: Optional[str] = None
    doctor_recommendations: Optional[List[Any]] = None
