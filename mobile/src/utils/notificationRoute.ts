import type { Href } from 'expo-router';

import type { AppNotification } from '@/api/types';

/**
 * Where a notification takes the user in the MOBILE app. The server stores only what a notification is ABOUT
 * (related_entity_type/id); each client maps that to its own screens. null = nowhere sensible to go.
 */
export function notificationHref(n: Pick<AppNotification, 'related_entity_type' | 'related_entity_id'>): Href | null {
  switch (n.related_entity_type) {
    case 'ASSESSMENT':
      return n.related_entity_id ? { pathname: '/assessment/[id]', params: { id: String(n.related_entity_id) } } : '/history';
    case 'MEDICINE_SCHEDULE':
      return '/medicines';
    case 'WEEKLY_REPORT':
      return '/reports';
    case 'GOAL':
      return '/track';
    case 'ASSESSMENT_DUE_WEEK':
      return '/assessment/new';
    default:
      return null;
  }
}

export const TYPE_LABELS: Record<string, string> = {
  MISSED_MEDICINE: 'Medicine', MEDICINE_REMINDER: 'Medicine', ASSESSMENT_COMPLETED: 'Assessment', WEEKLY_REPORT: 'Report',
  GOAL_PROGRESS: 'Goal', WELLNESS_REMINDER: 'Check-in', ADMIN_MESSAGE: 'Message',
};
export const typeLabel = (type: string) => TYPE_LABELS[type] ?? 'Notice';

/** "5 minutes ago", "yesterday" or a date. The API sends naive UTC timestamps. */
export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
