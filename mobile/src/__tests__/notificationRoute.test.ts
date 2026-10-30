import { notificationHref, timeAgo, typeLabel } from '@/utils/notificationRoute';

describe('notificationHref maps what a notification is about to a mobile screen', () => {
  it.each([
    [{ related_entity_type: 'ASSESSMENT', related_entity_id: 12 }, { pathname: '/assessment/[id]', params: { id: '12' } }],
    [{ related_entity_type: 'ASSESSMENT', related_entity_id: null }, '/history'],
    [{ related_entity_type: 'MEDICINE_SCHEDULE', related_entity_id: 99 }, '/medicines'],
    [{ related_entity_type: 'WEEKLY_REPORT', related_entity_id: 3 }, '/reports'],
    [{ related_entity_type: 'GOAL', related_entity_id: 4 }, '/track'],
    [{ related_entity_type: 'ASSESSMENT_DUE_WEEK', related_entity_id: 202641 }, '/assessment/new'],
  ])('%j', (n, href) => expect(notificationHref(n)).toEqual(href));
  it('returns null (no navigation) for unknown or missing targets', () => {
    expect(notificationHref({ related_entity_type: 'SOMETHING_NEW', related_entity_id: 1 })).toBeNull();
    expect(notificationHref({ related_entity_type: null, related_entity_id: null })).toBeNull();
  });
});

describe('timeAgo and typeLabel', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it.each([
    ['2026-10-11T11:59:40', 'just now'], ['2026-10-11T11:55:00', '5 minutes ago'], ['2026-10-11T09:00:00', '3 hours ago'],
    ['2026-10-10T11:00:00', 'yesterday'], ['2026-10-07T12:00:00', '4 days ago'],
  ])('%s -> %s', (iso, text) => expect(timeAgo(iso, now)).toBe(text));
  it('treats naive API timestamps as UTC and tolerates bad input', () => {
    expect(timeAgo('2026-10-11T11:55:00', now)).toBe(timeAgo('2026-10-11T11:55:00Z', now));
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('nope', now)).toBe('');
    expect(timeAgo('2026-10-11T12:09:00Z', now)).toBe('just now');
  });
  it('labels known types and tolerates new ones', () => {
    expect(typeLabel('WEEKLY_REPORT')).toBe('Report');
    expect(typeLabel('NEW_THING')).toBe('Notice');
  });
});
