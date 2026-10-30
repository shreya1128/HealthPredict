"""Fatty Liver (MASLD / NAFLD) Risk Awareness service.

Evaluates evidence-based cardiometabolic risk factors associated with
Metabolic Dysfunction-Associated Steatotic Liver Disease (MASLD).
Educational risk awareness only - strictly decoupled from predictive models.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.models.fatty_liver import FattyLiverScreening


def evaluate_fatty_liver_risk(
    bmi: float,
    waist_circumference_cm: float,
    has_hypertension: bool,
    has_type2_diabetes_or_prediabetes: bool,
    high_triglycerides: bool,
    low_hdl: bool,
    alcohol_units_weekly: int = 0,
    alt_u_l: Optional[float] = None,
    ast_u_l: Optional[float] = None,
    prior_imaging_steatosis: Optional[str] = "UNKNOWN",
) -> Dict[str, Any]:
    """Evaluate cardiometabolic risk factors according to clinical MASLD consensus."""
    metabolic_factors = []

    # 1. Body weight / Adiposity
    if bmi >= 25.0 or waist_circumference_cm >= 90.0:
        metabolic_factors.append("Elevated BMI (≥25) or central waist circumference")

    # 2. Glycemic dysregulation
    if has_type2_diabetes_or_prediabetes:
        metabolic_factors.append("Type 2 diabetes or prediabetes")

    # 3. Hypertension
    if has_hypertension:
        metabolic_factors.append("High blood pressure (hypertension)")

    # 4. Dyslipidemia: Triglycerides
    if high_triglycerides:
        metabolic_factors.append("Elevated triglycerides (≥150 mg/dL)")

    # 5. Dyslipidemia: Low HDL
    if low_hdl:
        metabolic_factors.append("Low HDL cholesterol")

    factors_count = len(metabolic_factors)

    # Alcohol classification
    alcohol_excess = alcohol_units_weekly > 14

    # Enzyme evaluation
    elevated_enzymes = False
    enzyme_notes = []
    if alt_u_l is not None:
        if alt_u_l > 35.0:
            elevated_enzymes = True
            enzyme_notes.append(f"Recorded ALT ({alt_u_l} U/L) is above typical reference limits (>35 U/L).")
        else:
            enzyme_notes.append(f"Recorded ALT ({alt_u_l} U/L) is within normal range.")

    if ast_u_l is not None:
        if ast_u_l > 35.0:
            elevated_enzymes = True
            enzyme_notes.append(f"Recorded AST ({ast_u_l} U/L) is above typical reference limits (>35 U/L).")
        else:
            enzyme_notes.append(f"Recorded AST ({ast_u_l} U/L) is within normal range.")

    has_steatosis_imaging = prior_imaging_steatosis in ("DETECTED_ULTRASOUND", "DETECTED_FIBROSCAN")

    # Risk Level Determination
    if has_steatosis_imaging or factors_count >= 3 or (factors_count >= 2 and elevated_enzymes):
        risk_level = "HIGH_AWARENESS"
        summary = "High Metabolic Awareness: Multiple risk factors or prior steatosis noted."
        guidance_core = [
            "You have multiple cardiometabolic risk factors strongly correlated with hepatic steatosis (MASLD).",
            "A comprehensive clinical evaluation by your physician is advised, including liver function tests (ALT, AST, Platelets, FIB-4 calculation) and abdominal ultrasound or FibroScan.",
            "Cardiometabolic management (weight optimization, blood glucose control, blood pressure control) is the primary evidence-based approach.",
        ]
    elif factors_count in (1, 2) or elevated_enzymes:
        risk_level = "MODERATE_AWARENESS"
        summary = "Moderate Metabolic Awareness: 1-2 cardiometabolic factors noted."
        guidance_core = [
            "Some cardiometabolic risk factors are present. While not confirming liver fat accumulation, these factors warrant proactive lifestyle focus.",
            "Prioritize aerobic activity (150+ min/week), a balanced Mediterranean-style whole-food diet, and limiting added sugars (particularly high-fructose beverages).",
            "Discuss liver enzyme screening (ALT/AST) at your next routine healthcare visit.",
        ]
    else:
        risk_level = "LOW_AWARENESS"
        summary = "Low Metabolic Awareness: Few or no cardiometabolic risk factors reported."
        guidance_core = [
            "Your profile reflects low current metabolic risk for fatty liver accumulation.",
            "Continue maintaining a healthy lifestyle, regular exercise, and balanced nutrition.",
        ]

    if alcohol_excess:
        guidance_core.append(f"Weekly alcohol intake ({alcohol_units_weekly} units) exceeds recommended moderation limits. Alcohol contributes directly to hepatic fat accumulation and stress.")

    clinical_disclaimer = (
        "Educational Awareness Notice: This assessment is an educational tool summarizing metabolic risk factors "
        "associated with steatotic liver disease (MASLD / NAFLD). It does NOT constitute a clinical diagnosis, "
        "nor can lifestyle questions alone confirm or rule out hepatic steatosis. Diagnostic confirmation requires "
        "physician-ordered laboratory testing and hepatic imaging."
    )

    full_guidance = (
        clinical_disclaimer + "\n\n"
        + "Key Observations & Recommendations:\n"
        + "\n".join(f"• {g}" for g in guidance_core)
    )
    if enzyme_notes:
        full_guidance += "\n\nLaboratory Observations:\n" + "\n".join(f"• {en}" for en in enzyme_notes)

    return {
        "risk_level": risk_level,
        "risk_summary": summary,
        "metabolic_factors_count": factors_count,
        "metabolic_factors": metabolic_factors,
        "alcohol_excess": alcohol_excess,
        "elevated_enzymes": elevated_enzymes,
        "clinical_guidance": full_guidance,
    }


def record_fatty_liver_screening(
    db: Session,
    user_id: int,
    data: Dict[str, Any],
    care_profile_id: Optional[int] = None,
    screening_date: Optional[date] = None,
) -> FattyLiverScreening:
    """Evaluate and store fatty liver risk awareness assessment."""
    if screening_date is None:
        screening_date = date.today()

    eval_result = evaluate_fatty_liver_risk(
        bmi=float(data.get("bmi", 24.0)),
        waist_circumference_cm=float(data.get("waist_circumference_cm", 82.0)),
        has_hypertension=bool(data.get("has_hypertension", False)),
        has_type2_diabetes_or_prediabetes=bool(data.get("has_type2_diabetes_or_prediabetes", False)),
        high_triglycerides=bool(data.get("high_triglycerides", False)),
        low_hdl=bool(data.get("low_hdl", False)),
        alcohol_units_weekly=int(data.get("alcohol_units_weekly", 0)),
        alt_u_l=float(data["alt_u_l"]) if data.get("alt_u_l") is not None else None,
        ast_u_l=float(data["ast_u_l"]) if data.get("ast_u_l") is not None else None,
        prior_imaging_steatosis=data.get("prior_imaging_steatosis", "UNKNOWN"),
    )

    screening = FattyLiverScreening(
        user_id=user_id,
        care_profile_id=care_profile_id,
        screening_date=screening_date,
        bmi=data.get("bmi", 24.0),
        waist_circumference_cm=data.get("waist_circumference_cm", 82.0),
        has_hypertension=bool(data.get("has_hypertension", False)),
        has_type2_diabetes_or_prediabetes=bool(data.get("has_type2_diabetes_or_prediabetes", False)),
        high_triglycerides=bool(data.get("high_triglycerides", False)),
        low_hdl=bool(data.get("low_hdl", False)),
        alcohol_units_weekly=int(data.get("alcohol_units_weekly", 0)),
        alt_u_l=data.get("alt_u_l"),
        ast_u_l=data.get("ast_u_l"),
        prior_imaging_steatosis=data.get("prior_imaging_steatosis"),
        metabolic_factors_count=eval_result["metabolic_factors_count"],
        risk_level=eval_result["risk_level"],
        risk_summary=eval_result["risk_summary"],
        educational_guidance=eval_result["clinical_guidance"],
    )
    db.add(screening)
    db.commit()
    db.refresh(screening)
    return screening


def get_fatty_liver_history(
    db: Session,
    user_id: int,
    care_profile_id: Optional[int] = None,
    limit: int = 20,
) -> List[FattyLiverScreening]:
    """Retrieve past fatty liver awareness screenings."""
    q = select(FattyLiverScreening).where(FattyLiverScreening.user_id == user_id)
    if care_profile_id is not None:
        q = q.where(FattyLiverScreening.care_profile_id == care_profile_id)
    return db.execute(q.order_by(desc(FattyLiverScreening.screening_date)).limit(limit)).scalars().all()
