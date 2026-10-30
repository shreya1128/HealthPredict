import { Calendar, Download, FileText, History as HistoryIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { reportService } from '../../services/dashboardService'
import { Spinner } from '../../components/common/Feedback'

function MetricRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value ?? <span className="text-slate-400 font-normal">No data</span>}</span>
    </div>
  )
}

export default function Reports() {
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadingFhir, setDownloadingFhir] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [c, h] = await Promise.all([reportService.weekly(), reportService.history()])
      setCurrent(c)
      setHistory(h || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function viewWeek(weekStartDate) {
    if (!weekStartDate) {
      setSelectedWeek(null)
      loadData()
      return
    }
    setLoadingWeek(true)
    try {
      const report = await reportService.weekly(weekStartDate)
      setCurrent(report)
      setSelectedWeek(weekStartDate)
    } finally {
      setLoadingWeek(false)
    }
  }

  async function download(id, weekStart) {
    if (!id) return
    setDownloadingId(id)
    try {
      await reportService.downloadPdf(id, `healthpredict-report-${weekStart}.pdf`)
    } finally {
      setDownloadingId(null)
    }
  }

  async function downloadFhirRecord() {
    setDownloadingFhir(true)
    try {
      await reportService.downloadFhir()
    } finally {
      setDownloadingFhir(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner label="Loading weekly report" /></div>
  if (!current) return null

  const isHistorical = selectedWeek !== null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Weekly Health Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Comprehensive weekly summaries of your health metrics, medicine adherence, and lifestyle insights.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadFhirRecord}
            disabled={downloadingFhir}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            title="Download electronic health record as HL7 FHIR Release 4 standard JSON"
          >
            <Download className="h-4 w-4 text-teal-600" aria-hidden="true" />
            {downloadingFhir ? 'Exporting FHIR...' : 'Export FHIR R4 (EHR)'}
          </button>
          {current.id && (
            <button
              onClick={() => download(current.id, current.week_start_date)}
              disabled={downloadingId === current.id}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {downloadingId === current.id ? 'Generating PDF...' : 'Download PDF Report'}
            </button>
          )}
        </div>
      </div>

      {/* Week Selector / Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex items-center gap-2 text-slate-700">
          <Calendar className="h-4 w-4 text-teal-600" aria-hidden="true" />
          <span className="font-medium">
            {isHistorical ? `Viewing Past Week (${current.week_start_date})` : 'Current Week'}
          </span>
          {isHistorical && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Archived
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isHistorical && (
            <button
              onClick={() => viewWeek(null)}
              className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
            >
              Return to Current Week
            </button>
          )}

          {history.length > 0 && (
            <select
              aria-label="Select report week"
              value={selectedWeek || current.week_start_date}
              onChange={(e) => viewWeek(e.target.value === history[0]?.week_start_date && !selectedWeek ? null : e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value={current.week_start_date}>Week of {current.week_start_date} {!isHistorical ? '(Current)' : ''}</option>
              {history
                .filter((h) => h.week_start_date !== current.week_start_date)
                .map((h) => (
                  <option key={h.id} value={h.week_start_date}>
                    Week of {h.week_start_date}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Report Card */}
      <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        {loadingWeek && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-xs">
            <Spinner label="Loading week metrics" />
          </div>
        )}

        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">
              Summary for {current.week_start_date} – {current.week_end_date}
            </h2>
            <p className="text-xs text-slate-500">
              Generated automatically based on daily tracking logs and assessments.
            </p>
          </div>
          {current.average_health_score != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Average Score:</span>
              <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-800 border border-teal-200">
                {current.average_health_score}/100
              </span>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <MetricRow label="Average health score" value={current.average_health_score != null ? `${current.average_health_score}/100` : null} />
          <MetricRow label="Weight change" value={current.weight_change_kg != null ? `${current.weight_change_kg > 0 ? '+' : ''}${current.weight_change_kg} kg` : null} />
          <MetricRow label="Total exercise" value={current.total_exercise_minutes != null ? `${current.total_exercise_minutes} min` : null} />
          <MetricRow label="Average sleep" value={current.average_sleep_duration != null ? `${current.average_sleep_duration} h/night` : null} />
          <MetricRow label="Average daily hydration" value={current.average_hydration_ml != null ? `${(current.average_hydration_ml / 1000).toFixed(1)} L (${current.average_hydration_ml} ml)` : null} />
          <MetricRow label="Medicine adherence" value={current.medicine_adherence_percent != null ? `${current.medicine_adherence_percent}%` : null} />
          <MetricRow label="Active goals progress" value={current.goals_progress_percent != null ? `${current.goals_progress_percent}%` : null} />
        </div>

        {current.significant_changes && current.significant_changes.length > 0 && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 border border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Notable Changes</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {current.significant_changes.map((c) => (
                <li key={c.metric} className="flex items-start gap-2">
                  <span className="text-teal-600">•</span>
                  <span>{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {current.recommendations && current.recommendations.length > 0 && (
          <div className="mt-4 rounded-xl bg-teal-50/60 p-4 border border-teal-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">Recommendations & Tips</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {current.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-base font-display font-semibold text-slate-900">Report History</h2>
        </div>

        <div className="mt-4 space-y-2.5">
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No historical reports archived yet. Weekly reports are generated automatically at the start of each week.
            </p>
          ) : (
            history.map((r) => {
              const isSelected = (selectedWeek || current.week_start_date) === r.week_start_date
              return (
                <div
                  key={r.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition ${
                    isSelected ? 'border-teal-500 bg-teal-50/30' : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className={`h-5 w-5 ${isSelected ? 'text-teal-600' : 'text-slate-400'}`} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Week of {r.week_start_date}
                        {r.week_end_date ? ` – ${r.week_end_date}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.average_health_score != null ? `Average Health Score: ${r.average_health_score}/100` : 'Score: Incomplete'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => viewWeek(r.week_start_date)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      {isSelected ? 'Viewing' : 'View Report'}
                    </button>
                    <button
                      onClick={() => download(r.id, r.week_start_date)}
                      disabled={downloadingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      PDF
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

