from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.models import User
from app.schemas.dashboard import WeeklyReportOut, WeeklyReportSummary
from app.schemas.doctor_share import DoctorNotesSubmit
from app.services import doctor_summary_service, fhir_service, report_service

router = APIRouter()


@router.post("/doctor-summary/share")
def create_doctor_share(
    days_range: int = Query(30, ge=7, le=90),
    questions: list[str] = Query(None),
    expire_days: int = Query(7, ge=1, le=30),
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Generate an expiring, revocable share link for your doctor."""
    share = doctor_summary_service.create_share_link(db, scope, days_range, questions, expire_days)
    return {
        "id": share.id,
        "token": share.token,
        "share_url": f"/s/{share.token}",
        "expires_at": share.expires_at.isoformat(),
        "days_range": share.days_range,
    }


@router.get("/doctor-summary/shares")
def list_doctor_shares(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """List all active and expired doctor share links with any physician notes."""
    shares = doctor_summary_service.list_shares(db, scope)
    return [
        {
            "id": s.id,
            "token": s.token,
            "share_url": f"/s/{s.token}",
            "expires_at": s.expires_at.isoformat(),
            "is_revoked": s.is_revoked,
            "is_valid": s.is_valid(),
            "created_at": s.created_at.isoformat(),
            "doctor_name": s.doctor_name,
            "doctor_notes": s.doctor_notes,
            "doctor_reviewed_at": s.doctor_reviewed_at.isoformat() if s.doctor_reviewed_at else None,
            "doctor_recommendations": s.doctor_recommendations or [],
            "notes": [
                {
                    "id": n.id,
                    "author_name": n.author_name,
                    "note_text": n.note_text,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                    "is_hidden": n.is_hidden,
                    "verification_status": "unverified, written by someone with your link",
                }
                for n in s.notes
            ],
        }
        for s in shares
    ]


@router.delete("/doctor-summary/share/{share_id}")
def revoke_doctor_share(
    share_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Revoke a doctor share link immediately."""
    doctor_summary_service.revoke_share(db, scope, share_id)
    return {"message": "Share link revoked"}


from app.utils.rate_limiter import rate_limit_auth


@router.get("/doctor-summary/public/{token}", dependencies=[Depends(rate_limit_auth)])
def get_public_summary(token: str, db: Session = Depends(get_db)):
    """Public doctor summary endpoint (accessible without account via secure token)."""
    return doctor_summary_service.get_public_doctor_summary(db, token)


@router.post("/doctor-summary/public/{token}/notes", dependencies=[Depends(rate_limit_auth)])
@router.post("/share/{token}/notes", dependencies=[Depends(rate_limit_auth)])
def submit_doctor_notes(
    token: str,
    data: DoctorNotesSubmit,
    db: Session = Depends(get_db),
):
    """Allows consulting physicians to submit clinical notes and recommendations back to patient summary."""
    return doctor_summary_service.submit_doctor_notes(
        db, token, data.doctor_name, data.doctor_notes, data.doctor_recommendations
    )


@router.patch("/doctor-summary/notes/{note_id}/hide")
def hide_doctor_note(
    note_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow patient to hide a note left on their share link."""
    doctor_summary_service.hide_doctor_note(db, user, note_id)
    return {"message": "Note hidden from public summary"}


@router.delete("/doctor-summary/notes/{note_id}")
def delete_doctor_note(
    note_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow patient to permanently delete a note left on their share link."""
    doctor_summary_service.delete_doctor_note(db, user, note_id)
    return {"message": "Note deleted"}


@router.get("/fhir")
def export_fhir_bundle(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Export current patient health record as an HL7 FHIR Release 4 document Bundle."""
    return fhir_service.generate_fhir_r4_bundle(db, scope)


@router.get("/fhir/download")
def download_fhir_bundle(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Download HL7 FHIR Release 4 JSON Bundle document file."""
    import json
    bundle = fhir_service.generate_fhir_r4_bundle(db, scope)
    content = json.dumps(bundle, indent=2)
    filename = f"healthpredict-fhir-patient-{scope.profile_id}.json"
    return Response(
        content=content,
        media_type="application/fhir+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/comprehensive-summary")
def get_comprehensive_summary(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Retrieve unified multi-subsystem health summary for active profile."""
    return report_service.get_comprehensive_health_summary(db, scope)


@router.get("/weekly", response_model=WeeklyReportOut)
def weekly_report(
    week_start: date = Query(default_factory=date.today),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    row = report_service.get_or_generate(db, scope, week_start)
    return report_service.report_to_dict(row)


@router.get("/weekly/history", response_model=list[WeeklyReportSummary])
def report_history(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return report_service.list_reports(db, scope)


@router.get("/weekly/{report_id}/pdf")
def weekly_report_pdf(
    report_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    row = report_service.get_report(db, scope, report_id)
    rep_dict = report_service.report_to_dict(row)
    name = rep_dict.get("profile_name") or scope.caller_user.full_name
    pdf_bytes = report_service.render_pdf(rep_dict, name)
    filename = f"healthpredict-report-{row.week_start_date}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/weekly/pdf")
def weekly_report_pdf_current(
    week_start: date = Query(default_factory=date.today),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    row = report_service.get_or_generate(db, scope, week_start)
    rep_dict = report_service.report_to_dict(row)
    name = rep_dict.get("profile_name") or scope.caller_user.full_name
    pdf_bytes = report_service.render_pdf(rep_dict, name)
    filename = f"healthpredict-report-{row.week_start_date}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
