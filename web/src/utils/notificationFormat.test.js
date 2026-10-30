import { describe, expect, it } from 'vitest'
import { capCount, notificationRoute, timeAgo, typeLabel } from './notificationFormat'

describe('notificationRoute maps what a notification is ABOUT to a real web page', () => {
  it.each([
    [{ related_entity_type: 'ASSESSMENT', related_entity_id: 12 }, '/assessment/12'],
    [{ related_entity_type: 'ASSESSMENT', related_entity_id: null }, '/history'],
    [{ related_entity_type: 'MEDICINE_SCHEDULE', related_entity_id: 99 }, '/medicines'],
    [{ related_entity_type: 'WEEKLY_REPORT', related_entity_id: 3 }, '/reports'],
    [{ related_entity_type: 'GOAL', related_entity_id: 4 }, '/goals'],
    [{ related_entity_type: 'ASSESSMENT_DUE_WEEK', related_entity_id: 202641 }, '/assessment'],
  ])('%j -> %s', (n, route) => expect(notificationRoute(n)).toBe(route))
  it('returns null (no link) for unknown or missing targets', () => {
    expect(notificationRoute({ related_entity_type: 'SOMETHING_NEW' })).toBeNull()
    expect(notificationRoute({})).toBeNull()
    expect(notificationRoute(null)).toBeNull()
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-10-11T12:00:00Z')
  it.each([
    ['2026-10-11T11:59:40', 'just now'],
    ['2026-10-11T11:55:00', '5 minutes ago'],
    ['2026-10-11T11:59:00', '1 minute ago'],
    ['2026-10-11T09:00:00', '3 hours ago'],
    ['2026-10-10T11:00:00', 'yesterday'],
    ['2026-10-07T12:00:00', '4 days ago'],
  ])('%s -> %s', (iso, text) => expect(timeAgo(iso, now)).toBe(text))
  it('treats naive API timestamps as UTC (same instant, same text, with or without Z)', () => {
    expect(timeAgo('2026-10-11T11:55:00', now)).toBe(timeAgo('2026-10-11T11:55:00Z', now))
  })
  it('shows a date after a week, and tolerates empty or invalid input and clock skew', () => {
    expect(timeAgo('2026-09-01T00:00:00Z', now)).toMatch(/2026/)
    expect(timeAgo(null, now)).toBe('')
    expect(timeAgo('garbage', now)).toBe('')
    expect(timeAgo('2026-10-11T12:05:00Z', now)).toBe('just now') // a timestamp slightly in the future
  })
})

describe('labels and counts', () => {
  it('labels types and tolerates unknown ones', () => {
    expect(typeLabel('MISSED_MEDICINE')).toBe('Medicine')
    expect(typeLabel('WEEKLY_REPORT')).toBe('Report')
    expect(typeLabel('FUTURE_TYPE')).toBe('Notice')
  })
  it('caps large unread counts', () => {
    expect(capCount(0)).toBe('0')
    expect(capCount(99)).toBe('99')
    expect(capCount(100)).toBe('99+')
  })
})
