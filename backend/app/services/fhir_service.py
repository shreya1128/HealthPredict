"""HL7 FHIR Release 4 Document Bundle Generator for HealthPredict.

Converts patient vitals, medication regimens, and health risk assessments into
standard-compliant FHIR R4 JSON (Bundle type 'document' with LOINC and SNOMED-CT codings)
for electronic health record (EHR) interoperability with Epic, Cerner, Apple Health,
and hospital clinical portals.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models.care_profile import CareProfile
from app.models.health import HealthAssessment
from app.models.medicine import Medicine
from app.models.user import User


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int, Optional[CareProfile]]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id, target.profile
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id, primary


def generate_fhir_r4_bundle(db: Session, target: User | ProfileScope) -> Dict[str, Any]:
    owner_id, profile_id, profile = _get_scope_ids(db, target)
    user = target.caller_user if isinstance(target, ProfileScope) else target
    if user.id != owner_id:
        user = db.get(User, owner_id) or user

    is_primary = profile.is_primary if profile else True
    patient_display_name = profile.full_name if profile else user.full_name
    patient_dob = profile.date_of_birth if profile and profile.date_of_birth else user.date_of_birth
    patient_gender = profile.gender if profile and profile.gender else (user.gender or "OTHER")

    bundle_id = str(uuid.uuid4())
    patient_id = f"patient-profile-{profile_id}"
    patient_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'patient.profile.{profile_id}')}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Retrieve recent assessments (up to 20) scoped to this profile
    assessment_filter = or_(HealthAssessment.care_profile_id == profile_id, HealthAssessment.care_profile_id.is_(None)) if is_primary else (HealthAssessment.care_profile_id == profile_id)
    assessments = db.scalars(
        select(HealthAssessment)
        .where(
            HealthAssessment.user_id == owner_id,
            assessment_filter,
        )
        .order_by(HealthAssessment.assessment_date.desc())
        .limit(20)
    ).all()

    # Retrieve active medications scoped to this profile
    medicine_filter = or_(Medicine.care_profile_id == profile_id, Medicine.care_profile_id.is_(None)) if is_primary else (Medicine.care_profile_id == profile_id)
    medicines = db.scalars(
        select(Medicine).where(
            Medicine.user_id == owner_id,
            medicine_filter,
            Medicine.is_active == True,  # noqa: E712
        )
    ).all()

    entries = []
    vital_references = []
    medication_references = []
    condition_references = []

    # 1. Patient Resource
    patient_resource = {
        "resourceType": "Patient",
        "id": patient_id,
        "identifier": [
            {
                "use": "official",
                "system": "https://healthpredict.local/patients",
                "value": str(profile_id),
            }
        ],
        "active": user.is_active,
        "name": [
            {
                "use": "official",
                "text": patient_display_name,
            }
        ],
        "gender": "male" if str(patient_gender).upper() == "MALE" else ("female" if str(patient_gender).upper() == "FEMALE" else "other"),
        "telecom": [],
    }
    # HARD RULE: Family member FHIR export must not contain the account owner's email or phone!
    if is_primary:
        if user.email:
            patient_resource["telecom"].append({"system": "email", "value": user.email, "use": "home"})
        if user.phone:
            patient_resource["telecom"].append({"system": "phone", "value": user.phone, "use": "mobile"})
    if patient_dob:
        patient_resource["birthDate"] = patient_dob.isoformat()

    # 2. MedicationStatement Resources
    for med in medicines:
        med_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'med.{med.id}')}"
        med_res = {
            "resourceType": "MedicationStatement",
            "id": f"med-{med.id}",
            "status": "active",
            "medicationCodeableConcept": {
                "text": med.name,
                "coding": [
                    {
                        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                        "display": med.name,
                    }
                ],
            },
            "subject": {"reference": patient_urn, "display": patient_display_name},
            "effectiveDateTime": med.start_date.isoformat() if med.start_date else now_iso,
            "dosage": [
                {
                    "text": f"{med.dosage} {med.dosage_unit or ''}, {med.frequency_times_per_day}x daily",
                    "patientInstruction": med.instructions or "",
                }
            ],
        }
        entries.append({"fullUrl": med_uuid, "resource": med_res})
        medication_references.append({"reference": med_uuid, "display": med.name})

    # 3. Observation & Condition Resources from Assessments
    for a in assessments:
        obs_date_iso = f"{a.assessment_date.isoformat()}T08:00:00Z"

        # Blood Pressure Observation (LOINC 85354-9)
        if a.systolic_bp and a.diastolic_bp:
            bp_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'bp.{a.id}')}"
            bp_res = {
                "resourceType": "Observation",
                "id": f"bp-{a.id}",
                "status": "final",
                "category": [
                    {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                "code": "vital-signs",
                                "display": "Vital Signs",
                            }
                        ]
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "85354-9",
                            "display": "Blood pressure panel with all children optional",
                        }
                    ],
                    "text": "Blood Pressure",
                },
                "subject": {"reference": patient_urn, "display": patient_display_name},
                "effectiveDateTime": obs_date_iso,
                "component": [
                    {
                        "code": {
                            "coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure"}],
                            "text": "Systolic blood pressure",
                        },
                        "valueQuantity": {
                            "value": float(a.systolic_bp),
                            "unit": "mmHg",
                            "system": "http://unitsofmeasure.org",
                            "code": "mm[Hg]",
                        },
                    },
                    {
                        "code": {
                            "coding": [{"system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure"}],
                            "text": "Diastolic blood pressure",
                        },
                        "valueQuantity": {
                            "value": float(a.diastolic_bp),
                            "unit": "mmHg",
                            "system": "http://unitsofmeasure.org",
                            "code": "mm[Hg]",
                        },
                    },
                ],
            }
            entries.append({"fullUrl": bp_uuid, "resource": bp_res})
            vital_references.append({"reference": bp_uuid, "display": f"BP {a.systolic_bp}/{a.diastolic_bp} mmHg"})

        # Heart Rate Observation (LOINC 8867-4)
        if a.heart_rate_bpm:
            hr_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'hr.{a.id}')}"
            hr_res = {
                "resourceType": "Observation",
                "id": f"hr-{a.id}",
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs", "display": "Vital Signs"}]}],
                "code": {
                    "coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}],
                    "text": "Heart Rate",
                },
                "subject": {"reference": patient_urn, "display": patient_display_name},
                "effectiveDateTime": obs_date_iso,
                "valueQuantity": {
                    "value": float(a.heart_rate_bpm),
                    "unit": "beats/minute",
                    "system": "http://unitsofmeasure.org",
                    "code": "/min",
                },
            }
            entries.append({"fullUrl": hr_uuid, "resource": hr_res})
            vital_references.append({"reference": hr_uuid, "display": f"Heart Rate {a.heart_rate_bpm} bpm"})

        # Blood Glucose Observation (LOINC 2339-0)
        if a.blood_glucose_mg_dl:
            glu_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'glu.{a.id}')}"
            glu_res = {
                "resourceType": "Observation",
                "id": f"glu-{a.id}",
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory", "display": "Laboratory"}]}],
                "code": {
                    "coding": [{"system": "http://loinc.org", "code": "2339-0", "display": "Glucose [Mass/volume] in Blood"}],
                    "text": "Blood Glucose",
                },
                "subject": {"reference": patient_urn, "display": patient_display_name},
                "effectiveDateTime": obs_date_iso,
                "valueQuantity": {
                    "value": float(a.blood_glucose_mg_dl),
                    "unit": "mg/dL",
                    "system": "http://unitsofmeasure.org",
                    "code": "mg/dL",
                },
            }
            entries.append({"fullUrl": glu_uuid, "resource": glu_res})
            vital_references.append({"reference": glu_uuid, "display": f"Glucose {a.blood_glucose_mg_dl} mg/dL"})

        # SpO2 Observation (LOINC 2708-6)
        if a.spo2_percent:
            spo2_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'spo2.{a.id}')}"
            spo2_res = {
                "resourceType": "Observation",
                "id": f"spo2-{a.id}",
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs", "display": "Vital Signs"}]}],
                "code": {
                    "coding": [{"system": "http://loinc.org", "code": "2708-6", "display": "Oxygen saturation in Arterial blood"}],
                    "text": "Oxygen Saturation (SpO2)",
                },
                "subject": {"reference": patient_urn, "display": patient_display_name},
                "effectiveDateTime": obs_date_iso,
                "valueQuantity": {
                    "value": float(a.spo2_percent),
                    "unit": "%",
                    "system": "http://unitsofmeasure.org",
                    "code": "%",
                },
            }
            entries.append({"fullUrl": spo2_uuid, "resource": spo2_res})
            vital_references.append({"reference": spo2_uuid, "display": f"SpO2 {a.spo2_percent}%"})

        # Health Assessment Risk Condition
        if a.risk_category:
            cond_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'cond.{a.id}')}"
            cond_res = {
                "resourceType": "Condition",
                "id": f"cond-{a.id}",
                "clinicalStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                            "code": "active",
                            "display": "Active",
                        }
                    ]
                },
                "verificationStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                            "code": "confirmed",
                            "display": "Confirmed",
                        }
                    ]
                },
                "category": [
                    {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                                "code": "problem-list-item",
                                "display": "Problem List Item",
                            }
                        ]
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": "722414000",
                            "display": "Cardiovascular risk screening",
                        }
                    ],
                    "text": f"Cardiovascular Risk Tier: {getattr(a.risk_category, 'value', a.risk_category)} (Score {a.health_score or 'N/A'}/100)",
                },
                "subject": {"reference": patient_urn, "display": patient_display_name},
                "recordedDate": obs_date_iso,
            }
            entries.append({"fullUrl": cond_uuid, "resource": cond_res})
            condition_references.append({"reference": cond_uuid, "display": f"Risk: {getattr(a.risk_category, 'value', a.risk_category)}"})

    # 4. Composition (Document Header / Summary)
    composition_uuid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'comp.profile.{profile_id}')}"
    composition = {
        "resourceType": "Composition",
        "id": f"comp-{profile_id}",
        "status": "final",
        "type": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "11503-0",
                    "display": "Medical records",
                }
            ],
            "text": "HealthPredict Clinical Summary Document",
        },
        "subject": {"reference": patient_urn, "display": patient_display_name},
        "date": now_iso,
        "author": [{"reference": patient_urn, "display": patient_display_name}],
        "title": f"HealthPredict Clinical Record - {patient_display_name}",
        "section": [
            {
                "title": "Vital Signs",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "8716-3",
                            "display": "Vital signs",
                        }
                    ]
                },
                "entry": vital_references[:15],
            },
            {
                "title": "Medications",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "10160-0",
                            "display": "History of Medication use",
                        }
                    ]
                },
                "entry": medication_references,
            },
            {
                "title": "Cardiovascular Risk Assessments & Clinical Conditions",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11450-4",
                            "display": "Problem list",
                        }
                    ]
                },
                "entry": condition_references[:10],
            },
        ],
    }

    # As per FHIR Document Bundle specifications, the first entry in a document bundle MUST be the Composition resource,
    # followed by the Patient resource, followed by other referenced resources.
    all_entries = [
        {"fullUrl": composition_uuid, "resource": composition},
        {"fullUrl": patient_urn, "resource": patient_resource},
    ] + entries

    return {
        "resourceType": "Bundle",
        "id": bundle_id,
        "identifier": {
            "system": "https://healthpredict.local/fhir/bundles",
            "value": bundle_id,
        },
        "type": "document",
        "timestamp": now_iso,
        "total": len(all_entries),
        "entry": all_entries,
    }
