"""Weekly health report: aggregates a Monday-Sunday week's data across every tracking
subsystem, generates plain-language insights, and renders a PDF on demand.

PDFs are NOT cached to disk (`weekly_reports.pdf_file_path` is left unused) - they're cheap to
regenerate from the stored metrics each time they're requested, which avoids needing file-storage
infrastructure for what is a lightweight, fast-to-render document.

"Recommendations" are app-navigation nudges tied to which metrics are missing or declined (e.g.
"log your sleep"), never medical advice - the project's "no prescription/treatment instructions"
rule applies here exactly as it does to the Phase 3 health score.
"""

import io
from datetime import date, timedelta
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import (
    CareProfile, ExerciseLog, HealthHistory, HydrationLog, Medicine, MedicineSchedule, SleepLog, User, WeeklyReport,
    HealthAssessment, HealthPrediction, DiabetesScreening, FattyLiverScreening, MenstrualLog,
)
from app.services import goal_service
from app.utils.wellness_insights import generate_insights

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

RECOMMENDATION_RULES = {
    "exercise_minutes": "No exercise logged this week - visit Track to log any activity, even a short walk.",
    "sleep_hours": "No sleep logged this week - visit Track to start logging your sleep.",
    "hydration_ml": "No water intake logged this week - visit Track to log your hydration.",
    "medicine_adherence_percent": "No medicine activity this week - visit Medicines to review your schedule.",
}


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_bounds(week_start: date) -> tuple[date, date]:
    start = monday_of(week_start)
    return start, start + timedelta(days=6)


def _avg(values: list[float]) -> Optional[float]:
    return round(sum(values) / len(values), 2) if values else None


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id


def week_metrics(db: Session, target: User | ProfileScope, start: date, end: date) -> dict:
    """Raw metrics for one week - used both for the current week and the comparison week."""
    owner_id, profile_id = _get_scope_ids(db, target)
    health_rows = db.scalars(select(HealthHistory).where(
        HealthHistory.user_id == owner_id,
        HealthHistory.care_profile_id == profile_id,
        HealthHistory.tracking_date >= start,
        HealthHistory.tracking_date <= end).order_by(HealthHistory.tracking_date)).all()
    scores = [float(r.health_score) for r in health_rows if r.health_score is not None]
    weights = [float(r.weight_kg) for r in health_rows if r.weight_kg is not None]

    exercise_rows = db.scalars(select(ExerciseLog).where(
        ExerciseLog.user_id == owner_id,
        ExerciseLog.care_profile_id == profile_id,
        ExerciseLog.exercise_date >= start,
        ExerciseLog.exercise_date <= end)).all()
    total_exercise = sum(r.duration_minutes or 0 for r in exercise_rows)

    sleep_rows = db.scalars(select(SleepLog).where(
        SleepLog.user_id == owner_id,
        SleepLog.care_profile_id == profile_id,
        SleepLog.sleep_date >= start,
        SleepLog.sleep_date <= end)).all()
    sleep_durations = [float(r.sleep_duration_hours) for r in sleep_rows if r.sleep_duration_hours is not None]

    hydration_rows = db.scalars(select(HydrationLog).where(
        HydrationLog.user_id == owner_id,
        HydrationLog.care_profile_id == profile_id,
        HydrationLog.hydration_date >= start,
        HydrationLog.hydration_date <= end)).all()
    daily_hydration: dict[date, int] = {}
    for r in hydration_rows:
        daily_hydration[r.hydration_date] = daily_hydration.get(r.hydration_date, 0) + r.water_intake_ml

    schedule_rows = db.execute(
        select(MedicineSchedule).join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
        .where(Medicine.user_id == owner_id,
               Medicine.care_profile_id == profile_id,
               MedicineSchedule.scheduled_date >= start,
               MedicineSchedule.scheduled_date <= end)
    ).scalars().all()
    adherence = round(sum(1 for r in schedule_rows if r.is_taken) / len(schedule_rows) * 100, 2) if schedule_rows else None

    return {
        "average_health_score": _avg(scores),
        "first_weight": weights[0] if weights else None, "last_weight": weights[-1] if weights else None,
        "total_exercise_minutes": total_exercise if exercise_rows else None,
        "average_sleep_duration": _avg(sleep_durations),
        "average_hydration_ml": _avg(list(daily_hydration.values())) if daily_hydration else None,
        "medicine_adherence_percent": adherence,
    }


def compute_weekly_report(db: Session, target: User | ProfileScope, week_start: date) -> dict:
    start, end = week_bounds(week_start)
    prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)

    current = week_metrics(db, target, start, end)
    previous = week_metrics(db, target, prev_start, prev_end)

    weight_change = None
    if current["first_weight"] is not None and current["last_weight"] is not None:
        weight_change = round(current["last_weight"] - current["first_weight"], 2)

    goals = goal_service.list_goals(db, target, status_filter="ACTIVE")
    goal_pcts = [g.percentage_complete for g in goals if g.percentage_complete is not None]
    goals_progress = _avg(goal_pcts)

    insight_input = {
        "exercise_minutes": current["total_exercise_minutes"], "sleep_hours": current["average_sleep_duration"],
        "hydration_ml": current["average_hydration_ml"], "medicine_adherence_percent": current["medicine_adherence_percent"],
        "health_score": current["average_health_score"],
    }
    insight_prev = {
        "exercise_minutes": previous["total_exercise_minutes"], "sleep_hours": previous["average_sleep_duration"],
        "hydration_ml": previous["average_hydration_ml"], "medicine_adherence_percent": previous["medicine_adherence_percent"],
        "health_score": previous["average_health_score"],
    }
    insights = generate_insights(insight_input, insight_prev)

    recommendations = [msg for key, msg in RECOMMENDATION_RULES.items() if insight_input.get(key) is None]

    return {
        "week_start_date": start, "week_end_date": end,
        "average_health_score": current["average_health_score"], "weight_change_kg": weight_change,
        "total_exercise_minutes": current["total_exercise_minutes"],
        "average_sleep_duration": current["average_sleep_duration"],
        "average_hydration_ml": current["average_hydration_ml"],
        "medicine_adherence_percent": current["medicine_adherence_percent"],
        "goals_progress_percent": goals_progress,
        "significant_changes": [{"metric": i.metric, "direction": i.direction, "message": i.message} for i in insights],
        "recommendations": recommendations,
    }


def get_or_generate(db: Session, target: User | ProfileScope, week_start: date) -> WeeklyReport:
    """Computes the report and upserts it into history - idempotent for a given profile+week."""
    owner_id, profile_id = _get_scope_ids(db, target)
    data = compute_weekly_report(db, target, week_start)
    row = db.scalar(select(WeeklyReport).where(
        WeeklyReport.user_id == owner_id,
        WeeklyReport.care_profile_id == profile_id,
        WeeklyReport.week_start_date == data["week_start_date"]))
    if row is None:
        row = WeeklyReport(user_id=owner_id, care_profile_id=profile_id)
        db.add(row)
    for field in ("week_start_date", "week_end_date", "average_health_score", "weight_change_kg",
                 "total_exercise_minutes", "average_sleep_duration", "average_hydration_ml",
                 "medicine_adherence_percent", "goals_progress_percent", "significant_changes",
                 "recommendations"):
        setattr(row, field, data[field])
    db.commit()
    db.refresh(row)
    return row


def list_reports(db: Session, target: User | ProfileScope, limit: int = 20) -> list[WeeklyReport]:
    owner_id, profile_id = _get_scope_ids(db, target)
    return list(db.scalars(select(WeeklyReport).where(
        WeeklyReport.user_id == owner_id,
        WeeklyReport.care_profile_id == profile_id,
    ).order_by(WeeklyReport.week_start_date.desc()).limit(limit)).all())


def get_report(db: Session, target: User | ProfileScope, report_id: int) -> WeeklyReport:
    owner_id, profile_id = _get_scope_ids(db, target)
    row = db.scalar(select(WeeklyReport).where(
        WeeklyReport.id == report_id,
        WeeklyReport.user_id == owner_id,
        WeeklyReport.care_profile_id == profile_id,
    ))
    if row is None:
        raise NOT_FOUND
    return row


def report_to_dict(row: WeeklyReport) -> dict:
    """Stored-row -> the same shape compute_weekly_report returns, for rendering a PDF of a
    historical report exactly as it was captured (not recomputed against today's live data)."""
    def f(v):
        return float(v) if v is not None else None
    profile_name = row.care_profile.full_name if row.care_profile else None
    is_primary = row.care_profile.is_primary if row.care_profile else True
    return {
        "id": row.id,
        "week_start_date": row.week_start_date, "week_end_date": row.week_end_date,
        "average_health_score": f(row.average_health_score), "weight_change_kg": f(row.weight_change_kg),
        "total_exercise_minutes": row.total_exercise_minutes, "average_sleep_duration": f(row.average_sleep_duration),
        "average_hydration_ml": f(row.average_hydration_ml), "medicine_adherence_percent": f(row.medicine_adherence_percent),
        "goals_progress_percent": f(row.goals_progress_percent),
        "significant_changes": row.significant_changes or [], "recommendations": row.recommendations or [],
        "profile_name": profile_name,
        "is_primary_profile": is_primary,
    }


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------

def _metric_rows(report: dict) -> list[list[str]]:
    def fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "No data"

    rows = [
        ["Metric", "Value"],
        ["Average health score", fmt(report["average_health_score"], "/100")],
        ["Weight change", fmt(report["weight_change_kg"], " kg")],
        ["Total exercise", fmt(report["total_exercise_minutes"], " min")],
        ["Average sleep", fmt(report["average_sleep_duration"], " h")],
        ["Average daily hydration", fmt(report["average_hydration_ml"], " ml")],
        ["Medicine adherence", fmt(report["medicine_adherence_percent"], "%")],
        ["Active goals progress", fmt(report["goals_progress_percent"], "%")],
    ]
    if report.get("diabetes_risk"):
        rows.append(["Diabetes risk screening", str(report["diabetes_risk"])])
    if report.get("fatty_liver_risk"):
        rows.append(["Fatty liver awareness", str(report["fatty_liver_risk"])])
    return rows


def render_pdf(report: dict, user_full_name: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    muted = ParagraphStyle("muted", parent=styles["Normal"], textColor=colors.grey, fontSize=9)

    subject_name = report.get("profile_name") or user_full_name
    story = [
        Paragraph("HealthPredict Weekly Report", styles["Title"]),
        Paragraph(f"{subject_name} &mdash; {report['week_start_date']} to {report['week_end_date']}", styles["Normal"]),
        Spacer(1, 16),
        Table(_metric_rows(report), colWidths=[3 * inch, 2.5 * inch], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0d9488")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])),
        Spacer(1, 20),
    ]

    story.append(Paragraph("Notable changes this week", styles["Heading2"]))
    if report["significant_changes"]:
        for c in report["significant_changes"]:
            story.append(Paragraph(f"&bull; {c['message']}", styles["Normal"]))
    else:
        story.append(Paragraph("No significant changes compared to the previous week.", muted))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Suggestions", styles["Heading2"]))
    if report["recommendations"]:
        for r in report["recommendations"]:
            story.append(Paragraph(f"&bull; {r}", styles["Normal"]))
    else:
        story.append(Paragraph("Nothing further to suggest this week.", muted))
    story.append(Spacer(1, 20))

    story.append(Paragraph(
        "This report is an educational wellness summary, not a medical diagnosis or advice. "
        "Consult a qualified healthcare professional for medical concerns.", muted))

    doc.build(story)
    return buf.getvalue()


def get_comprehensive_health_summary(db: Session, target: User | ProfileScope) -> dict:
    """Consolidate clinical assessments, predictions, screenings, and tracking into a unified profile dossier."""
    owner_id, profile_id = _get_scope_ids(db, target)

    # 1. Latest Health Assessment & Prediction
    q_ha = select(HealthAssessment).where(HealthAssessment.user_id == owner_id).order_by(HealthAssessment.assessment_date.desc()).limit(1)
    ha = db.scalar(q_ha)

    ha_data = None
    if ha:
        ha_data = {
            "id": ha.id,
            "date": str(ha.assessment_date),
            "health_score": float(ha.health_score) if ha.health_score else None,
            "risk_category": ha.risk_category,
            "bp": f"{ha.systolic_bp}/{ha.diastolic_bp}" if ha.systolic_bp and ha.diastolic_bp else None,
            "heart_rate": ha.heart_rate_bpm,
        }

    # 2. Latest Diabetes Screening
    q_diab = select(DiabetesScreening).where(DiabetesScreening.user_id == owner_id).order_by(DiabetesScreening.screening_date.desc()).limit(1)
    diab = db.scalar(q_diab)
    diab_data = None
    if diab:
        diab_data = {
            "id": diab.id,
            "date": str(diab.screening_date),
            "score": diab.total_score,
            "risk_level": diab.risk_level,
            "probability": diab.risk_probability_text,
        }

    # 3. Latest Fatty Liver Screening
    q_liver = select(FattyLiverScreening).where(FattyLiverScreening.user_id == owner_id).order_by(FattyLiverScreening.screening_date.desc()).limit(1)
    liver = db.scalar(q_liver)
    liver_data = None
    if liver:
        liver_data = {
            "id": liver.id,
            "date": str(liver.screening_date),
            "risk_level": liver.risk_level,
            "metabolic_factors": liver.metabolic_factors_count,
            "summary": liver.risk_summary,
        }

    # 4. Weekly Report metrics (current week)
    current_weekly = get_or_generate(db, target, date.today())
    weekly_dict = report_to_dict(current_weekly)

    return {
        "profile_id": profile_id,
        "owner_id": owner_id,
        "generated_at": str(date.today()),
        "vitals_assessment": ha_data,
        "diabetes_screening": diab_data,
        "fatty_liver_screening": liver_data,
        "weekly_metrics": weekly_dict,
    }

