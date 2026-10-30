// Mirrors backend/app/schemas/health.py exactly, for instant client-side feedback.
// The server re-validates independently and remains the source of truth.
export const VITAL_RANGES = {
  systolic_bp: [60, 260], diastolic_bp: [30, 200], heart_rate_bpm: [30, 220],
  blood_glucose_mg_dl: [20, 600], spo2_percent: [50, 100], temperature_celsius: [30, 43],
}

const SINGLE_VITAL_KEYS = ['systolic_bp', 'heart_rate_bpm', 'blood_glucose_mg_dl', 'spo2_percent', 'temperature_celsius']

/** form: object of string field values (as bound to <input>s). Returns a field->message map. */
export function validateAssessmentForm(form) {
  const errors = {}
  for (const [key, [lo, hi]] of Object.entries(VITAL_RANGES)) {
    const raw = form[key]
    if (raw === '' || raw === undefined) continue
    const n = Number(raw)
    if (Number.isNaN(n) || n < lo || n > hi) errors[key] = `Enter a value between ${lo} and ${hi}`
  }
  const hasSys = form.systolic_bp !== '' && form.systolic_bp !== undefined
  const hasDia = form.diastolic_bp !== '' && form.diastolic_bp !== undefined
  if (hasSys !== hasDia) {
    errors.systolic_bp = errors.diastolic_bp = 'Enter both systolic and diastolic, or leave both blank'
  }
  const anyVital = SINGLE_VITAL_KEYS.some((k) => form[k] !== '' && form[k] !== undefined)
  if (!anyVital) errors._form = 'Enter at least one vital sign to run an assessment'
  return errors
}

/** Converts validated string form values into the numeric payload the API expects. */
export function toAssessmentPayload(form) {
  const payload = {}
  const numericKeys = Object.keys(VITAL_RANGES)
  for (const key of numericKeys) {
    if (form[key] !== '' && form[key] !== undefined) payload[key] = Number(form[key])
  }
  if (form.assessment_notes) payload.assessment_notes = form.assessment_notes
  return payload
}
