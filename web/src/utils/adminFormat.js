/** Pure helpers for the admin pages (kept free of React so they can be unit-tested). */

export const formatNumber = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString())

/** `null` means "nothing to measure", which must never be shown as 0. */
export const formatPercent = (value, digits = 1) => (value === null || value === undefined ? 'No data' : `${Number(value).toFixed(digits)}%`)

export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`) // the API sends naive UTC timestamps
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDay(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '')
  if (!m) return isoDate || ''
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export const ACTION_LABELS = {
  USER_DEACTIVATED: 'Account deactivated',
  USER_REACTIVATED: 'Account reactivated',
}
export const actionLabel = (type) => ACTION_LABELS[type] || (type || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const STATE = (v) => (v === true ? 'Active' : v === false ? 'Inactive' : String(v))
/** "Active → Inactive" for an audit entry's changed account status. */
export function describeChange(oldValues, newValues) {
  if (oldValues && 'is_active' in oldValues && newValues && 'is_active' in newValues) {
    return `${STATE(oldValues.is_active)} → ${STATE(newValues.is_active)}`
  }
  return ''
}

const RISK = [['LOW', 'Low'], ['MODERATE', 'Moderate'], ['HIGH', 'High']]
/** Rows for the grouped risk bar chart: rule-based score vs the AI estimate. */
export const toRiskChartData = (risk) => RISK.map(([key, name]) => ({ name, 'Health score': risk?.rule_based?.[key] ?? 0, 'AI estimate': risk?.ml?.[key] ?? 0 }))

export const toTrendChartData = (trends) =>
  (trends?.points || []).map((p) => ({ date: p.date, label: formatDay(p.date), 'New users': p.new_users, Assessments: p.assessments, 'AI predictions': p.predictions }))

export const hasAnyRiskData = (risk) => Boolean(risk && (risk.members_with_assessment > 0 || risk.members_with_ml_prediction > 0))

/** One bar per candidate model (cross-validated mean ROC-AUC); flags the model that was selected. */
export const toComparisonChartData = (comparison, selected) =>
  (comparison || []).map((c) => ({
    name: c.name.replace(/_/g, ' '), key: c.name, rocAuc: c.metrics?.roc_auc?.mean ?? null, selected: c.name === selected,
  }))

export const METRIC_LABELS = { accuracy: 'Accuracy', precision: 'Precision', recall: 'Recall', f1_score: 'F1 score', roc_auc: 'ROC-AUC' }
export const metricPercent = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

export const confusionTotal = (cm) => (cm ? cm.true_negative + cm.false_positive + cm.false_negative + cm.true_positive : 0)
