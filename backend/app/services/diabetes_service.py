"""Diabetes risk screening service based on the validated FINDRISC / ADA non-invasive risk model.

Educational screening tool - strictly decoupled from cardiovascular ML predictions.
Provides clear risk categorization, 10-year risk estimates, breakdown, and clinical guidance.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.diabetes import DiabetesScreening


def calculate_findrisc_score(
    age: int,
    bmi: float,
    gender: str,  # 'MALE', 'FEMALE', or 'OTHER'
    waist_circumference_cm: float,
    physical_activity_daily_30m: bool,
    daily_fruits_vegetables: bool,
    hypertension_meds: bool,
    history_high_blood_glucose: bool,
    family_history_diabetes: str,  # 'NONE', 'SECOND_DEGREE', 'FIRST_DEGREE'
    fasting_glucose_mg_dl: Optional[float] = None,
    hba1c_percent: Optional[float] = None,
) -> Dict[str, Any]:
    """Calculate FINDRISC score and generate risk category with clinical recommendations.
    
    Validated scoring standard:
    - Age: <45 (0), 45-54 (2), 55-64 (3), >=65 (4)
    - BMI: <25 (0), 25-29.9 (1), >=30 (3)
    - Waist (Men): <94 (0), 94-102 (3), >102 (4)
    - Waist (Women/Other): <80 (0), 80-88 (3), >88 (4)
    - Physical activity (>=30m/day): Yes (0), No (2)
    - Daily fruits/veg: Yes (0), No (1)
    - High blood pressure meds: No (0), Yes (2)
    - Past high blood glucose: No (0), Yes (5)
    - Family history: None (0), Second degree (3), First degree (5)
    """
    breakdown = {}
    total_score = 0

    # 1. Age
    if age < 45:
        age_score = 0
    elif 45 <= age <= 54:
        age_score = 2
    elif 55 <= age <= 64:
        age_score = 3
    else:
        age_score = 4
    total_score += age_score
    breakdown["age"] = {"value": age, "points": age_score}

    # 2. BMI
    if bmi < 25.0:
        bmi_score = 0
    elif 25.0 <= bmi <= 29.9:
        bmi_score = 1
    else:
        bmi_score = 3
    total_score += bmi_score
    breakdown["bmi"] = {"value": round(bmi, 1), "points": bmi_score}

    # 3. Waist Circumference
    gender_upper = gender.upper() if gender else "MALE"
    if gender_upper == "MALE":
        if waist_circumference_cm < 94.0:
            waist_score = 0
        elif 94.0 <= waist_circumference_cm <= 102.0:
            waist_score = 3
        else:
            waist_score = 4
    else:
        if waist_circumference_cm < 80.0:
            waist_score = 0
        elif 80.0 <= waist_circumference_cm <= 88.0:
            waist_score = 3
        else:
            waist_score = 4
    total_score += waist_score
    breakdown["waist"] = {"value_cm": waist_circumference_cm, "points": waist_score}

    # 4. Physical Activity
    activity_score = 0 if physical_activity_daily_30m else 2
    total_score += activity_score
    breakdown["physical_activity"] = {"meets_guideline": physical_activity_daily_30m, "points": activity_score}

    # 5. Diet: Fruits / Vegetables
    diet_score = 0 if daily_fruits_vegetables else 1
    total_score += diet_score
    breakdown["diet_fruits_vegetables"] = {"daily": daily_fruits_vegetables, "points": diet_score}

    # 6. Antihypertensive medication
    htn_score = 2 if hypertension_meds else 0
    total_score += htn_score
    breakdown["hypertension_meds"] = {"takes_meds": hypertension_meds, "points": htn_score}

    # 7. Past high blood glucose
    glucose_history_score = 5 if history_high_blood_glucose else 0
    total_score += glucose_history_score
    breakdown["high_glucose_history"] = {"history_present": history_high_blood_glucose, "points": glucose_history_score}

    # 8. Family history
    fam_upper = (family_history_diabetes or "NONE").upper()
    if fam_upper in ("FIRST_DEGREE", "PARENT", "SIBLING", "CHILD"):
        fam_score = 5
    elif fam_upper in ("SECOND_DEGREE", "GRANDPARENT", "AUNT_UNCLE", "COUSIN"):
        fam_score = 3
    else:
        fam_score = 0
    total_score += fam_score
    breakdown["family_history"] = {"category": fam_upper, "points": fam_score}

    # Determine risk level and 10-year risk description
    if total_score < 7:
        risk_level = "LOW"
        risk_text = "Low risk (approx. 1% chance of developing Type 2 diabetes over 10 years)"
    elif 7 <= total_score <= 11:
        risk_level = "SLIGHTLY_ELEVATED"
        risk_text = "Slightly elevated risk (approx. 4% chance over 10 years)"
    elif 12 <= total_score <= 14:
        risk_level = "MODERATE"
        risk_text = "Moderate risk (approx. 17% chance over 10 years)"
    elif 15 <= total_score <= 20:
        risk_level = "HIGH"
        risk_text = "High risk (approx. 33% chance over 10 years)"
    else:
        risk_level = "VERY_HIGH"
        risk_text = "Very high risk (approx. 50% chance over 10 years)"

    # Recommendations & Guidance
    guidance_items = []
    if not physical_activity_daily_30m:
        guidance_items.append("Aim for at least 30 minutes of moderate physical activity (such as brisk walking) most days.")
    if not daily_fruits_vegetables:
        guidance_items.append("Include fresh vegetables, whole grains, and high-fiber foods in your daily meals.")
    if bmi >= 25.0:
        guidance_items.append("A modest 5-7% weight reduction significantly lowers diabetes onset risk.")
    if total_score >= 12:
        guidance_items.append("Because your risk score is moderate or higher, a laboratory screening (Fasting Blood Glucose or HbA1c) with your doctor is strongly advised.")

    lab_notes = []
    if fasting_glucose_mg_dl is not None:
        if fasting_glucose_mg_dl >= 126:
            lab_notes.append(f"Recorded fasting glucose ({fasting_glucose_mg_dl} mg/dL) is in the diabetes range (>=126 mg/dL). Confirm with doctor.")
        elif fasting_glucose_mg_dl >= 100:
            lab_notes.append(f"Recorded fasting glucose ({fasting_glucose_mg_dl} mg/dL) is in the impaired/prediabetes range (100-125 mg/dL).")
        else:
            lab_notes.append(f"Recorded fasting glucose ({fasting_glucose_mg_dl} mg/dL) is within normal reference range (<100 mg/dL).")

    if hba1c_percent is not None:
        if hba1c_percent >= 6.5:
            lab_notes.append(f"Recorded HbA1c ({hba1c_percent}%) meets clinical criteria for diabetes (>=6.5%). Consult physician.")
        elif hba1c_percent >= 5.7:
            lab_notes.append(f"Recorded HbA1c ({hba1c_percent}%) is in prediabetes range (5.7-6.4%).")
        else:
            lab_notes.append(f"Recorded HbA1c ({hba1c_percent}%) is in normal range (<5.7%).")

    clinical_guidance = (
        "Educational Screening Notice: This assessment is based on the Finnish Diabetes Risk Score (FINDRISC) "
        "and is intended for educational risk awareness only. It does not replace a clinical examination or diagnostic testing.\n\n"
        + ("\n".join(f"• {item}" for item in guidance_items) if guidance_items else "• Continue maintaining healthy diet and regular physical activity habits.")
    )
    if lab_notes:
        clinical_guidance += "\n\nLaboratory Observations:\n" + "\n".join(f"• {note}" for note in lab_notes)

    return {
        "method": "ADA_FINDRISC_V1",
        "total_score": total_score,
        "risk_level": risk_level,
        "risk_probability_text": risk_text,
        "score_breakdown": breakdown,
        "clinical_guidance": clinical_guidance,
        "lab_notes": lab_notes,
    }


def record_diabetes_screening(
    db: Session,
    user_id: int,
    screening_data: Dict[str, Any],
    care_profile_id: Optional[int] = None,
    screening_date: Optional[date] = None,
) -> DiabetesScreening:
    """Perform scoring and save diabetes screening record."""
    if screening_date is None:
        screening_date = date.today()

    result = calculate_findrisc_score(
        age=screening_data.get("age", 40),
        bmi=float(screening_data.get("bmi", 23.0)),
        gender=screening_data.get("gender", "MALE"),
        waist_circumference_cm=float(screening_data.get("waist_circumference_cm", 85.0)),
        physical_activity_daily_30m=bool(screening_data.get("physical_activity_daily_30m", True)),
        daily_fruits_vegetables=bool(screening_data.get("daily_fruits_vegetables", True)),
        hypertension_meds=bool(screening_data.get("hypertension_meds", False)),
        history_high_blood_glucose=bool(screening_data.get("history_high_blood_glucose", False)),
        family_history_diabetes=screening_data.get("family_history_diabetes", "NONE"),
        fasting_glucose_mg_dl=screening_data.get("fasting_glucose_mg_dl"),
        hba1c_percent=screening_data.get("hba1c_percent"),
    )

    screening = DiabetesScreening(
        user_id=user_id,
        care_profile_id=care_profile_id,
        screening_date=screening_date,
        method=result["method"],
        total_score=result["total_score"],
        risk_level=result["risk_level"],
        risk_probability_text=result["risk_probability_text"],
        input_data={
            **screening_data,
            "breakdown": result["score_breakdown"],
            "lab_notes": result["lab_notes"],
        },
        clinical_guidance=result["clinical_guidance"],
    )
    db.add(screening)
    db.commit()
    db.refresh(screening)
    return screening


def get_diabetes_screenings(
    db: Session,
    user_id: int,
    care_profile_id: Optional[int] = None,
    limit: int = 20,
) -> List[DiabetesScreening]:
    """Retrieve historical diabetes screenings."""
    query = db.query(DiabetesScreening).filter(DiabetesScreening.user_id == user_id)
    if care_profile_id is not None:
        query = query.filter(DiabetesScreening.care_profile_id == care_profile_id)
    return query.order_by(DiabetesScreening.screening_date.desc(), DiabetesScreening.id.desc()).limit(limit).all()
