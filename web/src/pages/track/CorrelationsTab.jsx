import { useEffect, useState } from 'react'
import { Sparkles, TrendingUp } from 'lucide-react'
import { trackingService } from '../../services/trackingService'
import { getErrorMessage } from '../../services/api'

export default function CorrelationsTab() {
  const [correlations, setCorrelations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)

  useEffect(() => {
    loadCorrelations(days)
  }, [days])

  async function loadCorrelations(d) {
    setLoading(true)
    setError('')
    try {
      const data = await trackingService.correlations.get(d)
      setCorrelations(data.correlations || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-slate-900 text-base">Multi-Factor Wellness Correlations</h2>
              <p className="text-xs text-slate-500">Cross-analyzing exercise, sleep quality, medication adherence, and symptoms.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  days === d ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3.5 pt-1">
            {correlations.map((c, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{c.pair_name}</span>
                    {c.has_sufficient_data && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        c.direction === 'positive'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.direction === 'negative'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {c.direction || 'Neutral'} (r = {c.correlation_coefficient != null ? c.correlation_coefficient : '--'})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Sample: {c.sample_size_days} paired days {c.sample_size_days < 5 && '(need 5+ for Pearson r)'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {c.insight_summary}
                </p>

                {c.actionable_tip && (
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-700 flex items-start gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Actionable Tip:</strong> {c.actionable_tip}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
