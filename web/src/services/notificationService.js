import { api } from './api'

/** In-app notification inbox, snooze, quiet hours, web push, and streaks. */
export const notificationService = {
  list: (params) => api.get('/notifications', { params }).then((r) => r.data),
  unreadCount: () => api.get('/notifications/unread-count').then((r) => r.data),
  /** Asks the server to derive any due notifications from the user's real records. Idempotent. */
  refresh: () => api.post('/notifications/refresh').then((r) => r.data),
  markRead: (id) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
  snooze: (id, minutes = 10) => api.post(`/notifications/${id}/snooze`, { minutes }).then((r) => r.data),
  getPreferences: () => api.get('/notifications/preferences').then((r) => r.data),
  updatePreferences: (data) => api.put('/notifications/preferences', data).then((r) => r.data),
  getVapidPublicKey: () => api.get('/notifications/vapid-public-key').then((r) => r.data),
  subscribeWebPush: (sub) => api.post('/notifications/web-push/subscribe', sub).then((r) => r.data),
  unsubscribeWebPush: (endpoint) => api.post('/notifications/web-push/unsubscribe', { endpoint }).then((r) => r.data),
  getStreaks: () => api.get('/notifications/streaks').then((r) => r.data),
}
