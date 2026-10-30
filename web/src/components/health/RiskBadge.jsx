const STYLES = {
  LOW: 'bg-emerald-100 text-emerald-800',
  MODERATE: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-red-100 text-red-800',
}
const LABELS = { LOW: 'Low risk', MODERATE: 'Moderate risk', HIGH: 'Higher risk' }

export default function RiskBadge({ risk }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STYLES[risk] || STYLES.MODERATE}`}>
      {LABELS[risk] || risk}
    </span>
  )
}
