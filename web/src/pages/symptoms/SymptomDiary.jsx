import { useState, useEffect } from 'react'
import { Activity, AlertCircle, Calendar, CheckCircle2, Clock, Plus, Sparkles } from 'lucide-react'
import { emergencyService } from '../../services/emergencyService'

const COMMON_SYMPTOMS = [
  'Headache',
  'Fatigue',
  'Dizziness',
  'Nausea',
  'Joint Pain',
  'Back Ache',
  'Chest Tightness',
  'Shortness of Breath',
  'Cough',
  'Stomach Cramps',
  'Muscle Weakness',
  'Anxiety / Palpitations',
]

const SEVERITY_LEVELS = [
  { level: 1, label: 'Very Mild', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', emoji: '🟢' },
  { level: 2, label: 'Mild', color: 'bg-teal-100 text-teal-800 border-teal-300', emoji: '🟡' },
  { level: 3, label: 'Moderate', color: 'bg-amber-100 text-amber-800 border-amber-300', emoji: '🟠' },
  { level: 4, label: 'Severe', color: 'bg-orange-100 text-orange-800 border-orange-300', emoji: '🔴' },
  { level: 5, label: 'Very Severe', color: 'bg-red-100 text-red-800 border-red-300', emoji: '🚨' },
]

export default function SymptomDiary() {
  const [symptoms, setSymptoms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [analytics, setAnalytics] = useState(null)

  // Form states
  const [symptomName, setSymptomName] = useState('')
  const [severity, setSeverity] = useState(2)
  const [notes, setNotes] = useState('')
  const [showLogForm, setShowLogForm] = useState(false)

  useEffect(() => {
    loadSymptoms()
  }, [])

  async function loadSymptoms() {
    setLoading(true)
    setError(null)
    try {
      const [listData, analyticsData] = await Promise.all([
        emergencyService.listSymptoms(30),
        emergencyService.getSymptomAnalytics(30).catch(() => null),
      ])
      setSymptoms(listData)
      setAnalytics(analyticsData)
    } catch (err) {
      setError('Unable to load symptoms diary. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogSymptom(e) {
    e.preventDefault()
    if (!symptomName.trim()) return

    setSubmitting(true)
    setSuccessMsg('')
    try {
      await emergencyService.logSymptom({
        symptom_name: symptomName.trim(),
        severity,
        notes: notes.trim() || null,
      })
      setSymptomName('')
      setSeverity(2)
      setNotes('')
      setShowLogForm(false)
      setSuccessMsg('Symptom logged successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadSymptoms()
    } catch (err) {
      setError('Failed to record symptom. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight">
            Symptom Diary
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Log how you feel every day to uncover trends and share with your doctor.
          </p>
        </div>
        <button
          onClick={() => setShowLogForm((prev) => !prev)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-teal-700 hover:bg-teal-800 transition shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          {showLogForm ? 'Hide Form' : 'Log How You Feel'}
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Quick Log Form Sheet / Panel */}
      {showLogForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            What are you experiencing?
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Select a common symptom or type your own.
          </p>

          <form onSubmit={handleLogSymptom} className="space-y-5">
            {/* Quick Suggestions */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Common Symptoms
              </label>
              <div className="flex flex-wrap gap-2">
                {COMMON_SYMPTOMS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSymptomName(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      symptomName.toLowerCase() === name.toLowerCase()
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Input field */}
            <div>
              <label htmlFor="symptomName" className="block text-sm font-medium text-slate-700 mb-1">
                Symptom Name
              </label>
              <input
                id="symptomName"
                type="text"
                required
                placeholder="e.g., Throbbing temple headache"
                value={symptomName}
                onChange={(e) => setSymptomName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Severity selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Severity Level: {SEVERITY_LEVELS.find((s) => s.level === severity)?.label}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {SEVERITY_LEVELS.map((s) => (
                  <button
                    key={s.level}
                    type="button"
                    onClick={() => setSeverity(s.level)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                      severity === s.level
                        ? `${s.color} border-2 shadow-sm font-bold scale-[1.02]`
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl mb-1">{s.emoji}</span>
                    <span className="text-xs font-medium">{s.label}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Rating {s.level}/5</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="symptomNotes" className="block text-sm font-medium text-slate-700 mb-1">
                Optional Notes
              </label>
              <textarea
                id="symptomNotes"
                rows={2}
                placeholder="What triggered it? Did rest or hydration help?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !symptomName.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition shadow-sm"
              >
                {submitting ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Symptom Analytics & Progression Trends (Group 8: E2) */}
      {analytics && analytics.total_logs > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-600" />
                Symptom Frequency & Progression Insights
              </h2>
              <p className="text-xs text-slate-500">
                Aggregated over past {analytics.days_analyzed} days ({analytics.total_logs} total logs across {analytics.unique_symptoms} unique symptoms)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Avg Severity:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                {analytics.overall_average_severity}/5
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.symptom_breakdown.map((item) => {
              const trendBadge =
                item.trend === 'INCREASING'
                  ? 'bg-rose-100 text-rose-700 border-rose-200'
                  : item.trend === 'DECREASING'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              return (
                <div key={item.symptom_name} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900 text-sm">{item.symptom_name}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${trendBadge}`}>
                      {item.trend}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 text-center text-xs">
                    <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400">Occurrences</div>
                      <div className="font-extrabold text-slate-800">{item.frequency}x</div>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400">Avg Sev</div>
                      <div className="font-extrabold text-slate-800">{item.average_severity}</div>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400">Peak Sev</div>
                      <div className="font-extrabold text-rose-600">{item.max_severity}/5</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Symptoms list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Recent Logs (Past 30 Days)
          </h2>
          <span className="text-xs font-medium text-slate-500">
            {symptoms.length} {symptoms.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : symptoms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md mx-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">No symptoms logged yet</h3>
            <p className="mt-1 text-sm text-slate-500 mb-5">
              Keep track of how you feel whenever you notice mild aches, tiredness, or discomfort.
            </p>
            <button
              onClick={() => setShowLogForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 transition shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Log Your First Symptom
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {symptoms.map((item) => {
              const sev = SEVERITY_LEVELS.find((s) => s.level === item.severity) || SEVERITY_LEVELS[1]
              const logDate = new Date(item.logged_at)
              const formattedDate = logDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              const formattedTime = logDate.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{sev.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 text-base">
                          {item.symptom_name}
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${sev.color}`}>
                          {sev.label} ({item.severity}/5)
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-slate-600 mt-1 italic">
                          "{item.notes}"
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formattedDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formattedTime}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p>
          <strong>Medical Note:</strong> This diary helps you spot daily patterns and record notes for your next appointment. If you experience severe chest pain, sudden numbness, or difficulty breathing, call emergency services immediately.
        </p>
      </div>
    </div>
  )
}
