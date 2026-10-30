import { TrendingDown, TrendingUp } from 'lucide-react'

export default function PredictionFactors({ factors = [] }) {
  return (
    <div className="space-y-4">
      {factors.map((f) => {
        const up = f.direction === 'increases'
        const Icon = up ? TrendingUp : TrendingDown
        return (
          <div key={f.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-slate-800">
                <Icon className={`h-4 w-4 ${up ? 'text-red-500' : 'text-emerald-500'}`} aria-hidden="true" />
                {f.label}
              </span>
              <span className="text-slate-500">{up ? 'Increases' : 'Decreases'} predicted risk</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-slate-100" role="progressbar"
              aria-valuenow={f.relative_strength} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.label} relative influence`}>
              <div className={`h-2 rounded-full ${up ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ width: `${f.relative_strength}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
