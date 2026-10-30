"""Voice-assisted health entry slot parser.

Extracts structured numeric values, units, and metrics from spoken health phrases:
- Weight (kg / lbs)
- Blood Pressure (systolic / diastolic mmHg)
- Sleep duration (hours / minutes)
- Hydration / Water intake (ml / liters / glasses)
- Exercise (type, duration minutes, intensity)

Strictly non-diagnostic and requires user confirmation before saving.
"""

import re
from typing import Any, Dict, Optional


WORD_TO_NUM = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90, "hundred": 100,
}


def _normalize_spoken_numbers(text: str) -> str:
    """Normalize simple spoken number phrases like 'one hundred twenty' or 'eight'."""
    text_lower = text.lower().strip()
    words = text_lower.split()
    output_words = []
    i = 0
    while i < len(words):
        w = words[i]
        # Match two-digit spoken numbers (e.g., twenty five -> 25)
        if w in ("twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety") and i + 1 < len(words) and words[i + 1] in ("one", "two", "three", "four", "five", "six", "seven", "eight", "nine"):
            val = WORD_TO_NUM[w] + WORD_TO_NUM[words[i + 1]]
            output_words.append(str(val))
            i += 2
        # Match 'one hundred twenty' -> 120
        elif w == "one" and i + 2 < len(words) and words[i + 1] == "hundred" and words[i + 2] in WORD_TO_NUM:
            val = 100 + WORD_TO_NUM[words[i + 2]]
            output_words.append(str(val))
            i += 3
        elif w in WORD_TO_NUM:
            output_words.append(str(WORD_TO_NUM[w]))
            i += 1
        else:
            output_words.append(w)
            i += 1
    return " ".join(output_words)


def parse_voice_health_entry(transcript: str) -> Dict[str, Any]:
    """Parse a transcribed voice utterance into a structured health entry draft.
    
    Returns a dictionary with:
    - `recognized`: bool
    - `metric_type`: "WEIGHT" | "BLOOD_PRESSURE" | "SLEEP" | "HYDRATION" | "EXERCISE" | None
    - `structured_fields`: dict of target form values
    - `confidence`: float (0.0 to 1.0)
    - `confirmation_prompt`: human-readable confirmation text
    """
    if not transcript or not transcript.strip():
        return {
            "recognized": False,
            "metric_type": None,
            "structured_fields": {},
            "confidence": 0.0,
            "confirmation_prompt": "No speech detected. Please speak clearly or enter manually.",
        }

    norm = _normalize_spoken_numbers(transcript)

    # 1. Blood Pressure: "120 over 80", "bp is 130 85", "blood pressure 125 / 82"
    bp_match = re.search(
        r"(?:blood pressure|bp)?\s*(?:is|was|of)?\s*(\d{2,3})\s*(?:over|/|\s)\s*(\d{2,3})",
        norm,
        re.IGNORECASE,
    )
    if ("blood pressure" in norm or "bp" in norm or "over" in norm) and bp_match:
        sys_val = int(bp_match.group(1))
        dia_val = int(bp_match.group(2))
        if 60 <= sys_val <= 260 and 40 <= dia_val <= 160:
            return {
                "recognized": True,
                "metric_type": "BLOOD_PRESSURE",
                "structured_fields": {
                    "systolic_bp": sys_val,
                    "diastolic_bp": dia_val,
                    "unit": "mmHg",
                },
                "confidence": 0.95,
                "confirmation_prompt": f"Record Blood Pressure as {sys_val}/{dia_val} mmHg?",
            }

    # 2. Weight: "weight is 68 kilograms", "68.5 kg", "weighed 72 kilos", "150 pounds"
    wt_match = re.search(
        r"(?:weight|weighed|weigh)?\s*(?:is|was|of)?\s*(\d+(?:\.\d+)?)\s*(kg|kilos|kilograms|lbs|pounds)?",
        norm,
        re.IGNORECASE,
    )
    if ("weight" in norm or "weigh" in norm or "kg" in norm or "kilo" in norm or "lbs" in norm) and wt_match:
        val = float(wt_match.group(1))
        unit_raw = (wt_match.group(2) or "kg").lower()
        # Convert lbs to kg if specified
        if "lb" in unit_raw or "pound" in unit_raw:
            val_kg = round(val * 0.453592, 1)
        else:
            val_kg = round(val, 1)

        if 20.0 <= val_kg <= 300.0:
            return {
                "recognized": True,
                "metric_type": "WEIGHT",
                "structured_fields": {
                    "weight_kg": val_kg,
                    "unit": "kg",
                },
                "confidence": 0.92,
                "confirmation_prompt": f"Record Weight as {val_kg} kg?",
            }

    # 3. Sleep: "slept for 7 hours", "sleep 8 hours", "7.5 hours of sleep"
    sleep_match = re.search(
        r"(?:slept|sleep)?\s*(?:for|was)?\s*(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)",
        norm,
        re.IGNORECASE,
    )
    if ("sleep" in norm or "slept" in norm) and sleep_match:
        hrs = float(sleep_match.group(1))
        if 0.5 <= hrs <= 24.0:
            return {
                "recognized": True,
                "metric_type": "SLEEP",
                "structured_fields": {
                    "sleep_duration_hours": round(hrs, 1),
                    "unit": "hours",
                },
                "confidence": 0.90,
                "confirmation_prompt": f"Record Sleep Duration as {round(hrs, 1)} hours?",
            }

    # 4. Hydration: "drank 500 ml of water", "water intake 2 liters", "drank 3 glasses of water"
    water_ml_match = re.search(
        r"(?:drank|water|hydration)?\s*(\d+(?:\.\d+)?)\s*(ml|milliliters|liters|l|glasses)?",
        norm,
        re.IGNORECASE,
    )
    if ("water" in norm or "drank" in norm or "hydration" in norm or "ml" in norm or "liter" in norm) and water_ml_match:
        val = float(water_ml_match.group(1))
        u = (water_ml_match.group(2) or "ml").lower()
        if "liter" in u or u == "l":
            ml = int(val * 1000)
        elif "glass" in u:
            ml = int(val * 250)
        else:
            ml = int(val)

        if 50 <= ml <= 10000:
            return {
                "recognized": True,
                "metric_type": "HYDRATION",
                "structured_fields": {
                    "water_intake_ml": ml,
                    "unit": "ml",
                },
                "confidence": 0.92,
                "confirmation_prompt": f"Record Hydration as {ml} ml of water?",
            }

    # 5. Exercise: "ran for 30 minutes", "exercised 45 minutes cycling", "walked for 20 minutes"
    ex_match = re.search(
        r"(?:exercised|workout|ran|walked|cycled|swam|jogged)?\s*(?:for)?\s*(\d+)\s*(?:minutes|mins|min)",
        norm,
        re.IGNORECASE,
    )
    if ("exercise" in norm or "walk" in norm or "run" in norm or "ran" in norm or "workout" in norm or "cycling" in norm or "yoga" in norm) and ex_match:
        mins = int(ex_match.group(1))
        # Infer exercise type from keywords
        ex_type = "Walking"
        if "run" in norm or "ran" in norm or "jog" in norm:
            ex_type = "Running"
        elif "cycl" in norm or "bike" in norm:
            ex_type = "Cycling"
        elif "yoga" in norm:
            ex_type = "Yoga"
        elif "swim" in norm:
            ex_type = "Swimming"
        elif "workout" in norm or "weight" in norm or "gym" in norm:
            ex_type = "Gym Workout"

        if 1 <= mins <= 480:
            return {
                "recognized": True,
                "metric_type": "EXERCISE",
                "structured_fields": {
                    "exercise_type": ex_type,
                    "duration_minutes": mins,
                    "intensity": "MODERATE",
                },
                "confidence": 0.88,
                "confirmation_prompt": f"Record Exercise as {mins} minutes of {ex_type}?",
            }

    return {
        "recognized": False,
        "metric_type": None,
        "structured_fields": {},
        "confidence": 0.0,
        "confirmation_prompt": f"Could not determine health metric from '{transcript}'. Please refine speech or enter manually.",
    }
