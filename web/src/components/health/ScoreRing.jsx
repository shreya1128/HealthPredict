const COLORS = { LOW: '#059669', MODERATE: '#d97706', HIGH: '#dc2626' }

/** Simple SVG ring - no chart library needed for a single value. */
export default function ScoreRing({ score, risk, size = 160 }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const color = COLORS[risk] || COLORS.MODERATE

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img"
        aria-label={`Health score ${score} out of 100, ${risk?.toLowerCase()} risk`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-display font-bold text-slate-900">{Math.round(score)}</span>
        <span className="text-xs text-slate-500">out of 100</span>
      </div>
    </div>
  )
}
