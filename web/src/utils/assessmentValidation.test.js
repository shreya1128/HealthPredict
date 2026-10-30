import { describe, expect, it } from 'vitest'
import { toAssessmentPayload, validateAssessmentForm, VITAL_RANGES } from './assessmentValidation'

const empty = { systolic_bp: '', diastolic_bp: '', heart_rate_bpm: '', blood_glucose_mg_dl: '',
               spo2_percent: '', temperature_celsius: '', assessment_notes: '' }

describe('validateAssessmentForm', () => {
  it('rejects a completely empty form with a form-level error', () => {
    const errors = validateAssessmentForm(empty)
    expect(errors._form).toBeTruthy()
  })

  it('accepts a single vital sign', () => {
    const errors = validateAssessmentForm({ ...empty, heart_rate_bpm: '70' })
    expect(errors).toEqual({})
  })

  it('requires blood pressure as a pair', () => {
    expect(validateAssessmentForm({ ...empty, systolic_bp: '120' }).diastolic_bp).toBeTruthy()
    expect(validateAssessmentForm({ ...empty, diastolic_bp: '80' }).systolic_bp).toBeTruthy()
    expect(validateAssessmentForm({ ...empty, systolic_bp: '120', diastolic_bp: '80' })).toEqual({})
  })

  it.each(Object.entries(VITAL_RANGES))('enforces the %s range (%s)', (key, [lo, hi]) => {
    const base = key === 'systolic_bp' ? { diastolic_bp: '75' } : key === 'diastolic_bp' ? { systolic_bp: '115' } : {}
    expect(validateAssessmentForm({ ...empty, ...base, [key]: String(lo - 1) })[key]).toBeTruthy()
    expect(validateAssessmentForm({ ...empty, ...base, [key]: String(hi + 1) })[key]).toBeTruthy()
    expect(validateAssessmentForm({ ...empty, ...base, [key]: String(lo) })[key]).toBeUndefined()
    expect(validateAssessmentForm({ ...empty, ...base, [key]: String(hi) })[key]).toBeUndefined()
  })

  it('rejects non-numeric input', () => {
    expect(validateAssessmentForm({ ...empty, heart_rate_bpm: 'abc' }).heart_rate_bpm).toBeTruthy()
  })
})

describe('toAssessmentPayload', () => {
  it('omits blank fields and converts numbers', () => {
    const payload = toAssessmentPayload({ ...empty, systolic_bp: '120', diastolic_bp: '80', assessment_notes: 'ok' })
    expect(payload).toEqual({ systolic_bp: 120, diastolic_bp: 80, assessment_notes: 'ok' })
  })

  it('produces a fully empty payload from a fully empty form', () => {
    expect(toAssessmentPayload(empty)).toEqual({})
  })
})
