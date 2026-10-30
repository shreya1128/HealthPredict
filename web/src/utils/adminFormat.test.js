import { describe, expect, it } from 'vitest'
import {
  actionLabel, confusionTotal, describeChange, formatDateTime, formatNumber, formatPercent, hasAnyRiskData, metricPercent,
  toComparisonChartData, toRiskChartData, toTrendChartData,
} from './adminFormat'

describe('number formatting never turns "no data" into zero', () => {
  it('formats null/undefined as an em dash or "No data"', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(0)).toBe('0')
    expect(formatPercent(null)).toBe('No data')
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(66.666, 1)).toBe('66.7%')
    expect(metricPercent(null)).toBe('—')
    expect(metricPercent(0.7346)).toBe('73.5%')
  })
})

describe('formatDateTime', () => {
  it('treats the API\'s naive timestamps as UTC, so the same instant renders the same either way', () => {
    expect(formatDateTime('2026-10-07T08:00:00')).toBe(formatDateTime('2026-10-07T08:00:00Z'))
  })
  it('handles empty and invalid input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not a date')).toBe('—')
  })
})

describe('audit helpers', () => {
  it('labels known actions and humanises unknown ones', () => {
    expect(actionLabel('USER_DEACTIVATED')).toBe('Account deactivated')
    expect(actionLabel('SOMETHING_NEW')).toBe('Something new')
  })
  it('describes a status change', () => {
    expect(describeChange({ is_active: true }, { is_active: false })).toBe('Active → Inactive')
    expect(describeChange({ is_active: false }, { is_active: true })).toBe('Inactive → Active')
    expect(describeChange(null, null)).toBe('')
    expect(describeChange({ role: 'USER' }, { role: 'ADMIN' })).toBe('')
  })
})

describe('chart data builders', () => {
  it('builds grouped risk bars and tolerates missing data', () => {
    expect(toRiskChartData({ rule_based: { LOW: 2, MODERATE: 1, HIGH: 0 }, ml: { LOW: 1, MODERATE: 1, HIGH: 1 } })).toEqual([
      { name: 'Low', 'Health score': 2, 'AI estimate': 1 },
      { name: 'Moderate', 'Health score': 1, 'AI estimate': 1 },
      { name: 'High', 'Health score': 0, 'AI estimate': 1 },
    ])
    expect(toRiskChartData(undefined).every((r) => r['Health score'] === 0 && r['AI estimate'] === 0)).toBe(true)
  })
  it('detects whether there is anything to chart', () => {
    expect(hasAnyRiskData({ members_with_assessment: 0, members_with_ml_prediction: 0 })).toBe(false)
    expect(hasAnyRiskData({ members_with_assessment: 1, members_with_ml_prediction: 0 })).toBe(true)
    expect(hasAnyRiskData(null)).toBe(false)
  })
  it('maps trend points keeping every day, zero or not', () => {
    const data = toTrendChartData({ points: [{ date: '2026-10-06', new_users: 0, assessments: 0, predictions: 0 }, { date: '2026-10-07', new_users: 2, assessments: 3, predictions: 1 }] })
    expect(data).toHaveLength(2)
    expect(data[1]).toMatchObject({ date: '2026-10-07', 'New users': 2, Assessments: 3, 'AI predictions': 1 })
    expect(toTrendChartData(null)).toEqual([])
  })
  it('flags the selected model and keeps null scores as null', () => {
    const rows = toComparisonChartData([{ name: 'gradient_boosting', metrics: { roc_auc: { mean: 0.8 } } }, { name: 'decision_tree', metrics: {} }], 'gradient_boosting')
    expect(rows[0]).toMatchObject({ name: 'gradient boosting', rocAuc: 0.8, selected: true })
    expect(rows[1]).toMatchObject({ rocAuc: null, selected: false })
  })
  it('totals a confusion matrix', () => {
    expect(confusionTotal({ true_negative: 5, false_positive: 3, false_negative: 2, true_positive: 10 })).toBe(20)
    expect(confusionTotal(null)).toBe(0)
  })
})
