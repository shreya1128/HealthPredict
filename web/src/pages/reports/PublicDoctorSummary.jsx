import {
  Activity,
  AlertCircle,
  Calendar,
  FileText,
  Heart,
  Pill,
  Send,
  Stethoscope,
  User,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Spinner } from '../../components/common/Feedback'
import { doctorSummaryService } from '../../services/careProfileService'

export default function PublicDoctorSummary() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Doctor consultation notes form state
  const [doctorName, setDoctorName] = useState('')
  const [doctorNotes, setDoctorNotes] = useState('')
  const [recommendationsText, setRecommendationsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await doctorSummaryService.getPublicSummary(token)
        setData(res)
        if (res.doctor_review?.doctor_name) {
          setDoctorName(res.doctor_review.doctor_name)
          setDoctorNotes(res.doctor_review.doctor_notes || '')
          setRecommendationsText(
            Array.isArray(res.doctor_review.doctor_recommendations)
              ? res.doctor_review.doctor_recommendations.join('\n')
              : ''
          )
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'This doctor summary link is invalid or has expired.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleSubmitNotes(e) {
    e.preventDefault()
    if (!doctorName.trim() || !doctorNotes.trim()) return
    setSubmitting(true)
    setSubmitSuccess(false)
    try {
      const recs = recommendationsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await doctorSummaryService.submitNotes(token, {
        doctor_name: doctorName.trim(),
        doctor_notes: doctorNotes.trim(),
        doctor_recommendations: recs,
      })
      setData((prev) => ({
        ...prev,
        doctor_review: {
          doctor_name: res.doctor_name,
          doctor_notes: doctorNotes.trim(),
          doctor_reviewed_at: res.doctor_reviewed_at,
          doctor_recommendations: res.doctor_recommendations,
        },
      }))
      setSubmitSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit consultation notes.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Spinner label="Loading clinical summary..." />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="mx-auto mt-16 max-w-md p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Summary Unavailable</h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </div>
    )
  }

  const {
    patient_name,
    days_range,
    questions_for_doctor,
    active_medicines = [],
    adherence_summary,
    recent_vitals = [],
    doctor_review,
    disclaimer,
  } = data

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                <Stethoscope className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  Clinical Consultation Summary
                </span>
                <h1 className="text-2xl font-display font-bold text-slate-900">{patient_name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>Reporting window: past {days_range} days</span>
            </div>
          </div>

          {/* Adherence and Quick Metrics */}
          {adherence_summary && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <Pill className="h-4 w-4 text-teal-600" />
                  <span>Medicine Adherence</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {adherence_summary.overall_percent != null ? `${adherence_summary.overall_percent}%` : 'N/A'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {adherence_summary.doses_taken} of {adherence_summary.doses_scheduled} doses recorded
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <Activity className="h-4 w-4 text-teal-600" />
                  <span>Active Prescriptions</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">{active_medicines.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Currently active regimens</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <Heart className="h-4 w-4 text-teal-600" />
                  <span>Vitals Logged</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">{recent_vitals.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Recorded assessments in window</p>
              </div>
            </div>
          )}

          {/* Patient Questions */}
          {questions_for_doctor && questions_for_doctor.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-700" />
                Patient Questions for This Visit
              </h2>
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-amber-950">
                {questions_for_doctor.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Active Medications Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-display font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Pill className="h-5 w-5 text-teal-600" />
            Current Medication Regimen
          </h2>
          {active_medicines.length === 0 ? (
            <p className="text-sm text-slate-500">No active medicines logged.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="pb-2">Medication</th>
                    <th className="pb-2">Dosage</th>
                    <th className="pb-2">Cadence</th>
                    <th className="pb-2">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {active_medicines.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-medium text-slate-900">{m.name}</td>
                      <td className="py-2.5 text-slate-700">{m.dosage ?? '—'}</td>
                      <td className="py-2.5 text-slate-700">{m.frequency}</td>
                      <td className="py-2.5 text-slate-500">{m.instructions || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Vitals Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-display font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Heart className="h-5 w-5 text-teal-600" />
            Recent Vitals & Biometrics
          </h2>
          {recent_vitals.length === 0 ? (
            <p className="text-sm text-slate-500">No recent vitals logged in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Blood Pressure</th>
                    <th className="pb-2">Heart Rate</th>
                    <th className="pb-2">Blood Glucose</th>
                    <th className="pb-2">SpO2</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent_vitals.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="py-2.5 text-slate-700 font-medium">{v.date}</td>
                      <td className="py-2.5 text-slate-900">{v.bp || '—'}</td>
                      <td className="py-2.5 text-slate-700">{v.heart_rate ? `${v.heart_rate} bpm` : '—'}</td>
                      <td className="py-2.5 text-slate-700">{v.glucose ? `${v.glucose} mg/dL` : '—'}</td>
                      <td className="py-2.5 text-slate-700">{v.spo2 != null ? `${v.spo2}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Doctor Consultation Write-Back Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900">Physician Write-Back & Clinical Notes</h2>
              <p className="text-xs text-slate-500">
                Submit consultation notes and recommendations directly back to the patient’s record.
              </p>
            </div>
          </div>

          {submitSuccess && (
            <div className="mb-6">
              <Alert kind="success">
                <span className="font-semibold">Consultation notes successfully recorded.</span> The patient will be able
                to review your feedback on their dashboard.
              </Alert>
            </div>
          )}

          {doctor_review?.doctor_reviewed_at && !submitSuccess && (
            <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
              <p className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                Previously Recorded Consultation
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                Dr. {doctor_review.doctor_name} — Reviewed on {new Date(doctor_review.doctor_reviewed_at).toLocaleDateString()}
              </p>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{doctor_review.doctor_notes}</p>
              {doctor_review.doctor_recommendations?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-900">Recommendations:</p>
                  <ul className="mt-1 list-disc list-inside text-xs text-slate-700 space-y-0.5">
                    {doctor_review.doctor_recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmitNotes} className="space-y-4">
            <div>
              <label htmlFor="doctor_name" className="block text-sm font-medium text-slate-700 mb-1">
                Physician Name & Title *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="doctor_name"
                  type="text"
                  required
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="e.g. Dr. Jane Smith, MD (Cardiology)"
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="doctor_notes" className="block text-sm font-medium text-slate-700 mb-1">
                Clinical Assessment & Consultation Notes *
              </label>
              <textarea
                id="doctor_notes"
                required
                rows={4}
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
                placeholder="Enter clinical observations, assessment of current vitals/medication compliance, and follow-up guidance..."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label htmlFor="recommendations" className="block text-sm font-medium text-slate-700 mb-1">
                Action Items & Recommendations (one per line)
              </label>
              <textarea
                id="recommendations"
                rows={3}
                value={recommendationsText}
                onChange={(e) => setRecommendationsText(e.target.value)}
                placeholder="e.g. Increase daily hydration to 2.5L&#10;Schedule follow-up lipid panel in 6 weeks"
                className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting Notes...' : 'Save Consultation Notes'}
            </button>
          </form>
        </div>

        {/* Disclaimer footer */}
        <p className="text-center text-xs text-slate-400 pb-8">{disclaimer}</p>
      </div>
    </div>
  )
}
