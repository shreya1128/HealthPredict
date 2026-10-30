from datetime import date, timedelta

from app.utils.timeutil import utcnow

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.models import MedicineSchedule, User
from app.schemas.medicine import (
    AdherenceOut, LogSkippedRequest, MedicineCreate, MedicineScanDraft,
    MedicineOut, MedicineUpdate, OverallAdherenceOut, RefillRequest, ScheduleEntryOut,
)
from app.services import drug_intelligence_service, medicine_service

router = APIRouter()


@router.get("/search-names")
async def search_medicine_names(query: str = Query(..., min_length=2), user: User = Depends(get_current_user)):
    """Search standardised medicine names using NIH RxNav API."""
    return await drug_intelligence_service.search_medicine_names(query)


@router.post("/check-interactions")
async def check_drug_interactions(
    drug_names: list[str] = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check interactions between medicines using openFDA drug label data.
    Returns honest status: 'found', 'none_found_in_source', or 'could_not_check'."""
    return await drug_intelligence_service.check_drug_interactions(drug_names, db)


@router.post("", response_model=MedicineOut, status_code=201)
def create_medicine(
    data: MedicineCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.create_medicine(db, scope, data)


@router.get("", response_model=list[MedicineOut])
def list_medicines(
    active_only: bool = Query(False),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.list_medicines(db, scope, active_only)


@router.get("/today", response_model=list[ScheduleEntryOut])
def today_schedule(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.get_today_schedule(db, scope)


@router.get("/adherence/overall", response_model=OverallAdherenceOut)
def overall_adherence(
    days: int = Query(30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.get_overall_adherence_summary(db, scope, days)


@router.get("/{medicine_id}", response_model=MedicineOut)
def get_medicine(
    medicine_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.get_medicine(db, scope, medicine_id)


@router.put("/{medicine_id}", response_model=MedicineOut)
def update_medicine(
    medicine_id: int,
    data: MedicineUpdate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.update_medicine(db, scope, medicine_id, data)


@router.delete("/{medicine_id}", status_code=204)
def delete_medicine(
    medicine_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    medicine_service.delete_medicine(db, scope, medicine_id)


@router.get("/{medicine_id}/schedule", response_model=list[ScheduleEntryOut])
def medicine_schedule(
    medicine_id: int,
    past_days: int = Query(7, ge=0, le=90),
    upcoming_days: int = Query(14, ge=0, le=90),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    medicine = medicine_service.get_medicine(db, scope, medicine_id)  # 404 if not owned
    medicine_service.ensure_schedule_ahead(db, medicine, days_ahead=upcoming_days)
    lo, hi = date.today() - timedelta(days=past_days), date.today() + timedelta(days=upcoming_days)
    rows = db.scalars(select(MedicineSchedule).where(
        MedicineSchedule.medicine_id == medicine_id, MedicineSchedule.scheduled_date >= lo,
        MedicineSchedule.scheduled_date <= hi,
    ).order_by(MedicineSchedule.scheduled_date.asc(), MedicineSchedule.scheduled_time.asc())).all()
    return rows


@router.post("/{medicine_id}/schedule/{schedule_id}/taken", response_model=ScheduleEntryOut)
def mark_taken(
    medicine_id: int,
    schedule_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.log_taken(db, scope, medicine_id, schedule_id)


@router.post("/{medicine_id}/schedule/{schedule_id}/skipped", response_model=ScheduleEntryOut)
def mark_skipped(
    medicine_id: int,
    schedule_id: int,
    data: LogSkippedRequest = LogSkippedRequest(),
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.log_skipped(db, scope, medicine_id, schedule_id, data.reason)


@router.get("/{medicine_id}/adherence", response_model=AdherenceOut)
def adherence(
    medicine_id: int,
    days: int = Query(30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return medicine_service.get_adherence(db, scope, medicine_id, days)


@router.post("/{medicine_id}/refill", response_model=MedicineOut)
def refill_medicine(
    medicine_id: int,
    data: RefillRequest,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Record a refill: adds quantity to the current supply."""
    return medicine_service.refill_medicine(db, scope, medicine_id, data.quantity, data.pharmacy_note)


@router.post("/scan", response_model=MedicineScanDraft, status_code=200)
async def scan_medicine(
    image: UploadFile = File(...),
    scope: ProfileScope = Depends(require_write_scope),
):
    """Scan a medicine photo and return an editable draft. Requires FEATURE_MEDICINE_SCAN=true and VISION_API_KEY."""
    if not settings.FEATURE_MEDICINE_SCAN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medicine scanning is not enabled on this server")
    if not settings.VISION_API_KEY:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Medicine scanning is not configured — the server has no vision service key")
    return await medicine_service.scan_medicine_image(image)

