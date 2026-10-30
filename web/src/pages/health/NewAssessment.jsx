import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { healthService } from '../../services/healthService'
import { getErrorMessage } from '../../services/api'
import { toAssessmentPayload, validateAssessmentForm } from '../../utils/assessmentValidation'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

const empty = { systolic_bp: '', diastolic_bp: '', heart_rate_bpm: '', blood_glucose_mg_dl: '',
               spo2_percent: '', temperature_celsius: '', assessment_notes: '' }

export default function NewAssessment() {
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(ev) {
    ev.preventDefault()
    const found = validateAssessmentForm(form)
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length) return
    setLoading(true)
    try {
      const result = await healthService.createAssessment(toAssessmentPayload(form))
      navigate(`/assessment/${result.id}`, { replace: true })
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const bind = (id, label, extra = {}) => (
    <Field id={id} label={label} error={errors[id]}>
      <input id={id} type="number" inputMode="decimal" value={form[id]} onChange={set(id)}
        aria-invalid={Boolean(errors[id])} className={inputClass(errors[id])} {...extra} />
    </Field>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-display font-bold text-slate-900">New health assessment</h1>
      <p className="mt-1 text-slate-600">
        Enter today's vitals. Any physical and lifestyle details from your profile are included automatically.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        {serverError && <Alert>{serverError}</Alert>}
        {errors._form && <Alert>{errors._form}</Alert>}

        <fieldset className="grid grid-cols-2 gap-4">
          <legend className="mb-2 text-sm font-semibold text-slate-700">Blood pressure (mmHg)</legend>
          {bind('systolic_bp', 'Systolic', { placeholder: 'e.g. 118' })}
          {bind('diastolic_bp', 'Diastolic', { placeholder: 'e.g. 76' })}
        </fieldset>

        {bind('heart_rate_bpm', 'Resting heart rate (bpm)', { placeholder: 'e.g. 68' })}
        <Field id="blood_glucose_mg_dl" label="Blood glucose (mg/dL)" error={errors.blood_glucose_mg_dl}
          hint="Ideally measured fasting - see the note on your results.">
          <input id="blood_glucose_mg_dl" type="number" inputMode="decimal" value={form.blood_glucose_mg_dl}
            onChange={set('blood_glucose_mg_dl')} className={inputClass(errors.blood_glucose_mg_dl)} placeholder="e.g. 90" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {bind('spo2_percent', 'SpO2 (%)', { placeholder: 'e.g. 98', step: '0.1' })}
          {bind('temperature_celsius', 'Temperature (°C)', { placeholder: 'e.g. 36.8', step: '0.1' })}
        </div>
        <Field id="assessment_notes" label="Notes (optional)">
          <textarea id="assessment_notes" rows={3} value={form.assessment_notes} onChange={set('assessment_notes')}
            maxLength={2000} className={inputClass(false)} placeholder="How are you feeling today?" />
        </Field>

        <SubmitButton loading={loading} loadingText="Calculating…">Get my health score</SubmitButton>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        This score is an educational wellness indicator, not a medical diagnosis. Consult a qualified
        healthcare professional for medical concerns.
      </p>
    </div>
  )
}
