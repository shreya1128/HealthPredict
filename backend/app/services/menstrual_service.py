"""Menstrual cycle tracking and PCOS educational screening service.

Supports period logging, automatic cycle length calculation, history statistics,
and decoupled Rotterdam-aligned educational PCOS symptom evaluation.
Avoids unvalidated clinical predictions and misleading ovulation claims.
"""

from datetime import date, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import select, desc
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.menstrual import MenstrualLog, PCOSScreening


def record_menstrual_log(
    db: Session,
    user_id: int,
    period_start_date: date,
    care_profile_id: Optional[int] = None,
    period_end_date: Optional[date] = None,
    flow_intensity: Optional[str] = None,
    pain_level: Optional[int] = None,
    symptoms: Optional[List[str]] = None,
    notes: Optional[str] = None,
) -> MenstrualLog:
    """Record a period log and automatically calculate duration and cycle length."""
    if period_end_date:
        if period_end_date < period_start_date:
            raise HTTPException(
                status_code=422,
                detail="Period end date cannot be earlier than start date",
            )
        duration_days = (period_end_date - period_start_date).days + 1
        if duration_days > 21:
            raise HTTPException(
                status_code=422,
                detail="Single period duration exceeds 21 days; please verify dates or consult a healthcare provider",
            )
    else:
        duration_days = None

    # Calculate cycle length relative to previous period start date
    q_prev = (
        select(MenstrualLog)
        .where(
            MenstrualLog.user_id == user_id,
            MenstrualLog.period_start_date < period_start_date,
        )
    )
    if care_profile_id is not None:
        q_prev = q_prev.where(MenstrualLog.care_profile_id == care_profile_id)
    prev_log = db.execute(q_prev.order_by(desc(MenstrualLog.period_start_date))).scalars().first()

    cycle_length = None
    if prev_log:
        days_diff = (period_start_date - prev_log.period_start_date).days
        if 15 <= days_diff <= 120:
            cycle_length = days_diff

    log = MenstrualLog(
        user_id=user_id,
        care_profile_id=care_profile_id,
        period_start_date=period_start_date,
        period_end_date=period_end_date,
        period_duration_days=duration_days,
        cycle_length_days=cycle_length,
        flow_intensity=flow_intensity,
        pain_level=pain_level,
        symptoms=symptoms or [],
        notes=notes,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_menstrual_logs(
    db: Session,
    user_id: int,
    care_profile_id: Optional[int] = None,
    limit: int = 50,
) -> List[MenstrualLog]:
    """Retrieve logged menstrual records."""
    q = select(MenstrualLog).where(MenstrualLog.user_id == user_id)
    if care_profile_id is not None:
        q = q.where(MenstrualLog.care_profile_id == care_profile_id)
    return db.execute(q.order_by(desc(MenstrualLog.period_start_date)).limit(limit)).scalars().all()


def delete_menstrual_log(
    db: Session,
    log_id: int,
    user_id: int,
) -> bool:
    """User-controlled privacy deletion of a menstrual record."""
    log = db.get(MenstrualLog, log_id)
    if not log or log.user_id != user_id:
        return False
    db.delete(log)
    db.commit()
    return True


def get_cycle_analytics(
    db: Session,
    user_id: int,
    care_profile_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Compute cycle analytics with explicit uncertainty handling."""
    logs = get_menstrual_logs(db, user_id, care_profile_id, limit=24)

    if len(logs) < 2:
        return {
            "total_cycles_recorded": len(logs),
            "average_cycle_length_days": None,
            "average_period_duration_days": None,
            "cycle_regularity": "INSUFFICIENT_DATA",
            "regularity_notes": "At least 2 completed cycles are required to estimate cycle metrics and regularity.",
            "disclaimer": "Educational tracking only. Does not predict fertile windows or replace clinical contraception.",
        }

    cycle_lengths = [l.cycle_length_days for l in logs if l.cycle_length_days is not None]
    durations = [l.period_duration_days for l in logs if l.period_duration_days is not None]

    avg_cycle = round(sum(cycle_lengths) / len(cycle_lengths), 1) if cycle_lengths else None
    avg_duration = round(sum(durations) / len(durations), 1) if durations else None

    # Evaluate regularity
    if cycle_lengths:
        min_c = min(cycle_lengths)
        max_c = max(cycle_lengths)
        spread = max_c - min_c
        if len(cycle_lengths) == 1:
            if 21 <= avg_cycle <= 35:
                regularity = "REGULAR"
                reg_notes = f"Cycle length is {avg_cycle} days (within typical 21-35 day range). Track more cycles to monitor variation."
            else:
                regularity = "IRREGULAR"
                reg_notes = f"Cycle length was {avg_cycle} days (outside typical 21-35 day range). Continue tracking."
        elif spread <= 7 and 21 <= avg_cycle <= 35:
            regularity = "REGULAR"
            reg_notes = f"Cycles are regular with an average length of {avg_cycle} days (normal range: 21-35 days)."
        else:
            regularity = "IRREGULAR"
            reg_notes = f"Cycle lengths show variation ({min_c} to {max_c} days). Variations greater than 7-9 days may warrant medical discussion."
    else:
        regularity = "INSUFFICIENT_DATA"
        reg_notes = "More cycle data needed to evaluate variation."

    return {
        "total_cycles_recorded": len(logs),
        "average_cycle_length_days": avg_cycle,
        "average_period_duration_days": avg_duration,
        "cycle_regularity": regularity,
        "regularity_notes": reg_notes,
        "recent_cycles": [
            {
                "id": l.id,
                "start_date": l.period_start_date.isoformat(),
                "end_date": l.period_end_date.isoformat() if l.period_end_date else None,
                "cycle_days": l.cycle_length_days,
                "duration_days": l.period_duration_days,
                "flow": l.flow_intensity,
            }
            for l in logs[:6]
        ],
        "disclaimer": "Educational tracking only. Does not predict fertile windows or replace clinical contraception.",
    }


def evaluate_pcos_symptoms(
    cycle_regularity: str,  # REGULAR, IRREGULAR, INFREQUENT
    excess_androgen_symptoms: List[str],  # e.g. ["HIRSUTISM", "ACNE", "ALOPECIA"]
    metabolic_indicators: List[str],      # e.g. ["WEIGHT_GAIN", "ACANTHOSIS_NIGRICANS"]
    ultrasound_findings: Optional[str] = "NOT_DONE",  # NOT_DONE, NORMAL, POLYCYSTIC_MORPHOLOGY
) -> Dict[str, Any]:
    """Educational assessment aligned with Rotterdam consensus criteria components.
    
    Rotterdam criteria require 2 of 3 features:
    1. Oligo- or anovulation (irregular or infrequent periods)
    2. Clinical or biochemical hyperandrogenism
    3. Polycystic ovarian morphology on ultrasound
    """
    rotterdam_count = 0
    criteria_met = []

    # Criterion 1: Ovulatory dysfunction
    if cycle_regularity in ("IRREGULAR", "INFREQUENT", "ABSENT"):
        rotterdam_count += 1
        criteria_met.append("Irregular or infrequent menstrual cycles (oligo/anovulation)")

    # Criterion 2: Hyperandrogenism
    androgen_active = [s for s in excess_androgen_symptoms if s.upper() not in ("NONE", "")]
    if len(androgen_active) >= 1:
        rotterdam_count += 1
        criteria_met.append(f"Hyperandrogenic features reported: {', '.join(androgen_active)}")

    # Criterion 3: Ultrasound
    if ultrasound_findings == "POLYCYSTIC_MORPHOLOGY":
        rotterdam_count += 1
        criteria_met.append("Polycystic ovarian morphology noted on prior ultrasound")

    symptom_total = len(androgen_active) + len(metabolic_indicators)
    if cycle_regularity != "REGULAR":
        symptom_total += 1

    if rotterdam_count >= 2:
        risk_text = "Elevated Likelihood — Meets Rotterdam Educational Screening Patterns (2+ features)"
        guidance = (
            "Educational Notice: Your responses align with 2 or more features commonly evaluated in PCOS "
            "(Rotterdam consensus criteria). A formal diagnosis requires clinical evaluation by a gynecologist or endocrinologist, "
            "including hormone blood tests (free testosterone, DHEAS, LH/FSH) and exclusion of other conditions such as "
            "thyroid dysfunction or elevated prolactin."
        )
    elif rotterdam_count == 1 or symptom_total >= 2:
        risk_text = "Borderline / Mild Presentation (1 Rotterdam feature or metabolic indicators)"
        guidance = (
            "Educational Notice: Some isolated symptoms (such as cycle variation or skin/hair symptoms) were noted. "
            "These symptoms can stem from lifestyle factors, stress, nutritional imbalances, or thyroid variations. "
            "Discuss with a healthcare provider if symptoms persist or cause discomfort."
        )
    else:
        risk_text = "Low Likelihood Based on Reported Symptoms"
        guidance = (
            "Educational Notice: Few or no primary PCOS features were reported. Maintain balanced nutrition, "
            "regular physical activity, and track your cycle regularly."
        )

    return {
        "rotterdam_features_count": rotterdam_count,
        "criteria_met": criteria_met,
        "symptom_count": symptom_total,
        "risk_assessment_text": risk_text,
        "educational_guidance": guidance,
    }


def record_pcos_screening(
    db: Session,
    user_id: int,
    data: Dict[str, Any],
    care_profile_id: Optional[int] = None,
    screening_date: Optional[date] = None,
) -> PCOSScreening:
    """Store educational PCOS symptom screening."""
    if screening_date is None:
        screening_date = date.today()

    eval_result = evaluate_pcos_symptoms(
        cycle_regularity=data.get("cycle_regularity", "REGULAR"),
        excess_androgen_symptoms=data.get("excess_androgen_symptoms", []),
        metabolic_indicators=data.get("metabolic_indicators", []),
        ultrasound_findings=data.get("ultrasound_findings", "NOT_DONE"),
    )

    screening = PCOSScreening(
        user_id=user_id,
        care_profile_id=care_profile_id,
        screening_date=screening_date,
        cycle_regularity=data.get("cycle_regularity", "REGULAR"),
        excess_androgen_symptoms=data.get("excess_androgen_symptoms", []),
        metabolic_indicators=data.get("metabolic_indicators", []),
        ultrasound_findings=data.get("ultrasound_findings", "NOT_DONE"),
        symptom_count=eval_result["symptom_count"],
        risk_assessment_text=eval_result["risk_assessment_text"],
        educational_guidance=eval_result["educational_guidance"],
    )
    db.add(screening)
    db.commit()
    db.refresh(screening)
    return screening
