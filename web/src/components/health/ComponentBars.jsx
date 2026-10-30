import { Info } from 'lucide-react'

function barColor(score) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ComponentBars({ components = [], skipped = [] }) {
  return (
    <div className="space-y-5">
      {components.map((c) => (
        <div key={c.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-800">{c.label}</span>
            <span className="text-slate-500">{c.score}/100 · {c.weight_pct}% of score</span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100" role="progressbar"
            aria-valuenow={c.score} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}>
            <div className={`h-2.5 rounded-full ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
          </div>
        </div>
      ))}
      {skipped.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> Not included in this score
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {skipped.map((s) => <li key={s.key}>• {s.label}: {s.reason}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
