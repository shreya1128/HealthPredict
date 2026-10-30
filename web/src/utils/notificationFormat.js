/** Pure helpers for the notification UI. */

export const TYPE_LABELS = {
  MISSED_MEDICINE: 'Medicine',
  MEDICINE_REMINDER: 'Medicine',
  ASSESSMENT_COMPLETED: 'Assessment',
  WEEKLY_REPORT: 'Report',
  GOAL_PROGRESS: 'Goal',
  WELLNESS_REMINDER: 'Check-in',
  ADMIN_MESSAGE: 'Message',
  REFILL_ALERT: 'Refill',
  APPOINTMENT_REMINDER: 'Appointment',
  STREAK_MILESTONE: 'Milestone',
}
export const typeLabel = (type) => TYPE_LABELS[type] || 'Notice'

/**
 * Where a notification should take the user in the WEB app. The server only stores what the notification is about
 * (related_entity_type/id); each client maps that to its own routes. Returns null when there is nowhere sensible to go.
 */
export function notificationRoute(n) {
  switch (n?.related_entity_type) {
    case 'ASSESSMENT': return n.related_entity_id ? `/assessment/${n.related_entity_id}` : '/history'
    case 'MEDICINE_SCHEDULE': return '/medicines'
    case 'medicine_schedule': return '/medicines'
    case 'medicine_refill': return '/medicines'
    case 'caregiver_missed_dose': return '/medicines'
    case 'appointment_reminder_24h':
    case 'appointment_reminder_2h': return '/emergency'
    case 'STREAK_MILESTONE': return '/medicines'
    case 'WEEKLY_REPORT': return '/reports'
    case 'GOAL': return '/goals'
    case 'ASSESSMENT_DUE_WEEK': return '/assessment'
    default: return null
  }
}

/** "5 minutes ago", "yesterday", or a date. The API sends naive UTC timestamps. */
export function timeAgo(iso, now = new Date()) {
  if (!iso) return ''
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const seconds = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const capCount = (n) => (n > 99 ? '99+' : String(n))
