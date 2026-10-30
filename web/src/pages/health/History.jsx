import { ClipboardList } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { healthService } from '../../services/healthService'
import { getErrorMessage } from '../../services/api'
import RiskBadge from '../../components/health/RiskBadge'
import { Alert, Spinner } from '../../components/common/Feedback'

const RANGE_OPTIONS = [
  { days: 30, label: '30 days' }, { days: 90, label: '3 months' }, { days: 365, label: '1 year' },
]

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <p className="text-slate-600">Complete your first health assessment to start tracking your progress.</p>
      <Link to="/assessment" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700">
        <ClipboardList className="h-4 w-4" aria-hidden="true" /> New assessment
      </Link>
    </div>
  )
}

export default function History() {
  const [days, setDays] = useState(90)
  const [trend, setTrend] = useState(null)
  const [page, setPage] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([healthService.getHistory(days), healthService.listAssessments(1, 20)])
      .then(([h, p]) => { if (!cancelled) { setTrend(h); setPage(p) } })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  if (loading && !page) return <div className="flex justify-center py-20"><Spinner label="Loading history" /></div>
  if (error) return <Alert>{error}</Alert>
  if (page && page.total === 0) return <EmptyState />

  const chartData = (trend?.points || []).map((p) => ({
    date: new Date(p.tracking_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: p.health_score !== null ? Number(p.health_score) : null,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-slate-900">Your health trends</h1>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGE_OPTIONS.map((o) => (
            <button key={o.days} onClick={() => setDays(o.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                days === o.days ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700">Health score over time</h2>
        {chartData.length < 2 ? (
          <p className="mt-8 mb-8 text-center text-sm text-slate-500">
            Complete another assessment on a different day to see a trend line.
          </p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" name="Health score" stroke="#0d9488" strokeWidth={2}
                  dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Data used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page?.items.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50">
                <td className="px-0 py-0">
                  <Link to={`/assessment/${a.id}`} className="block px-4 py-3 text-slate-900">
                    {new Date(a.assessment_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{Math.round(Number(a.health_score))}</td>
                <td className="px-4 py-3"><RiskBadge risk={a.risk_category} /></td>
                <td className="px-4 py-3 text-slate-500">{a.data_completeness_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && page.total > page.items.length && (
        <p className="mt-3 text-center text-sm text-slate-500">Showing {page.items.length} of {page.total} assessments.</p>
      )}
    </div>
  )
}
