import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, LineChart as LineChartIcon, RefreshCw, Stethoscope } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { healthService } from '../../services/healthService'
import { getErrorMessage } from '../../services/api'
import ScoreRing from '../../components/health/ScoreRing'
import RiskBadge from '../../components/health/RiskBadge'
import ComponentBars from '../../components/health/ComponentBars'
import PredictionFactors from '../../components/health/PredictionFactors'
import { Alert, Spinner } from '../../components/common/Feedback'

export default function AssessmentResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcSuccess, setRecalcSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    healthService.getAssessment(id)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) navigate('/history', { replace: true, state: { notice: 'That assessment could not be found.' } })
        else setError(getErrorMessage(err))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, navigate])

  const handleRecalculate = async () => {
    try {
      setRecalculating(true)
      setError('')
      const updated = await healthService.recalculate(id)
      setData(updated)
      setRecalcSuccess('Snapshot refreshed with your current profile vitals and lifestyle habits.')
      setTimeout(() => setRecalcSuccess(''), 6000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setRecalculating(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner label="Loading results" /></div>
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  const vitals = [
    ['Blood pressure', data.systolic_bp && data.diastolic_bp ? `${data.systolic_bp}/${data.diastolic_bp} mmHg` : null],
    ['Heart rate', data.heart_rate_bpm ? `${data.heart_rate_bpm} bpm` : null],
    ['Blood glucose', data.blood_glucose_mg_dl ? `${data.blood_glucose_mg_dl} mg/dL` : null],
    ['SpO2', data.spo2_percent ? `${data.spo2_percent}%` : null],
    ['Temperature', data.temperature_celsius ? `${data.temperature_celsius}°C` : null],
  ].filter(([, v]) => v)

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/history" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to history
      </Link>

      {recalcSuccess && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 p-4 text-sm text-teal-900 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0" aria-hidden="true" />
          <span>{recalcSuccess}</span>
        </div>
      )}

      {data.is_stale && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">Profile updates detected</h3>
                <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
                  {data.stale_reasons?.[0] || 'Your profile vitals or lifestyle habits have changed since this assessment was created.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-amber-800 disabled:opacity-50 transition shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} aria-hidden="true" />
              {recalculating ? 'Recalculating...' : 'Recalculate snapshot'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">{new Date(data.assessment_date).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
            <h1 className="mt-1 text-2xl font-display font-bold text-slate-900">Your health score</h1>
            <div className="mt-2"><RiskBadge risk={data.risk_category} /></div>
          </div>
          <ScoreRing score={Number(data.health_score)} risk={data.risk_category} />
        </div>

        {Number(data.data_completeness_percent) < 100 && (
          <div className="mt-6 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              This score is based on {data.data_completeness_percent}% of the full profile
              {data.profile_hints.length > 0 && <> — <Link to="/profile" className="font-medium underline">complete your profile</Link> for a fuller picture.</>}
            </span>
          </div>
        )}

        {vitals.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {vitals.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-0.5 font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 text-lg font-display font-semibold text-slate-900">Score breakdown</h2>
        <div className="mt-4">
          <ComponentBars components={data.score_breakdown?.components} skipped={data.score_breakdown?.skipped} />
        </div>

        {data.assessment_notes && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700">Your notes</h3>
            <p className="mt-1 text-sm text-slate-600">{data.assessment_notes}</p>
          </div>
        )}

        {data.glucose_caveat && <p className="mt-6 text-xs text-slate-500">{data.glucose_caveat}</p>}
        <p className="mt-2 text-xs text-slate-500">{data.disclaimer}</p>
      </div>

      {/* Dangerous reading banner */}
      {(data.systolic_bp >= 180 || data.diastolic_bp >= 120 || (data.spo2_percent && data.spo2_percent < 92) || (data.blood_glucose_mg_dl && (data.blood_glucose_mg_dl < 54 || data.blood_glucose_mg_dl > 300))) && (
        <div className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-red-900 shadow-sm" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-red-900">Please see a doctor or seek medical care soon</h2>
              <p className="mt-1 text-sm text-red-800 leading-relaxed">
                One or more of your readings (such as very high blood pressure or unusual blood sugar/oxygen) is outside normal ranges.
                Do not wait if you feel chest pain, shortness of breath, dizziness, or confusion.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Heart Health Estimate (Tier 2 AI prediction or unlock prompt) */}
      {data.ml_prediction ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-display font-bold text-slate-900">Heart health estimate</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            A population-based statistical estimate of your overall cardiovascular pattern.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RiskBadge risk={data.ml_prediction.risk_level} />
            <span className="text-sm font-medium text-slate-700">
              Estimated category:{' '}
              <strong className="text-slate-900">
                {data.ml_prediction.risk_level === 'LOW' ? 'Lower range' : data.ml_prediction.risk_level === 'MODERATE' ? 'Moderate range' : 'Higher range'}
              </strong>
            </span>
          </div>

          {data.ml_prediction.explanation_text && (
            <p className="mt-4 text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              {data.ml_prediction.explanation_text}
            </p>
          )}

          <h3 className="mt-6 text-sm font-semibold text-slate-800">What affects your estimate most</h3>
          <div className="mt-3">
            <PredictionFactors factors={data.ml_prediction.top_factors} />
          </div>

          {/* Actionable suggestions */}
          <div className="mt-6 rounded-xl bg-teal-50/60 border border-teal-100 p-4">
            <h4 className="text-sm font-bold text-teal-900">What to do next</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-teal-800">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">•</span> Keep tracking your blood pressure at the same time each morning.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">•</span> Share this report and trends summary with your doctor during your next visit.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">•</span> Stay consistent with hydration, sleep, and physical movement.
              </li>
            </ul>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            This is an estimate based on general population data, not a diagnosis.
          </p>
        </div>
      ) : data.ml_prediction_missing_fields && data.ml_prediction_missing_fields.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-6">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-teal-900">Complete your profile to unlock heart health estimate</h2>
          </div>
          <p className="mt-2 text-sm text-teal-800">
            Answer a few more quick profile questions (like cholesterol level or lifestyle details) to unlock your personalized estimate:
          </p>
          <ul className="mt-2.5 list-inside list-disc text-sm text-teal-800 space-y-1">
            {data.ml_prediction_missing_fields.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link
            to="/profile"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 transition"
          >
            Complete profile answers →
          </Link>
        </div>
      ) : null}

      {/* Clinical Guidance: Screening vs. Diagnosis & Doctor Discussions */}
      {(data.clinical_context || (data.recommended_discussions && data.recommended_discussions.length > 0)) && (
        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/50 p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="h-5 w-5 text-sky-700" aria-hidden="true" />
            <h2 className="text-base font-display font-bold text-sky-950">Clinical guidance & doctor discussions</h2>
          </div>

          {data.clinical_context && (
            <div className="mt-3 text-xs leading-relaxed text-sky-900 bg-white/80 p-3.5 rounded-xl border border-sky-100">
              <span className="font-semibold text-sky-950">Screening vs. Diagnosis: </span>
              {data.clinical_context}
            </div>
          )}

          {data.recommended_discussions && data.recommended_discussions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-900">
                Recommended questions for your doctor
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-sky-900">
                {data.recommended_discussions.map((topic, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 bg-white/60 p-2.5 rounded-lg border border-sky-100/60">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-200 text-xs font-semibold text-sky-800">
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{topic}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/assessment" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-800 transition">
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> New health check
        </Link>
        <Link to="/history" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition">
          <LineChartIcon className="h-4 w-4" aria-hidden="true" /> View trends
        </Link>
      </div>
    </div>
  )
}
