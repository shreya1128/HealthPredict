import { api } from './api'

/** Admin API (all routes require the ADMIN role on the server; the UI guard is only a convenience). */
export const adminService = {
  overview: () => api.get('/admin/stats/overview').then((r) => r.data),
  risk: () => api.get('/admin/stats/risk').then((r) => r.data),
  trends: (days = 30) => api.get('/admin/stats/trends', { params: { days } }).then((r) => r.data),
  usage: (days = 30) => api.get('/admin/stats/usage', { params: { days } }).then((r) => r.data),
  mlModel: () => api.get('/admin/ml/model').then((r) => r.data),
  users: (params) => api.get('/admin/users', { params }).then((r) => r.data),
  setUserStatus: (id, isActive, reason) =>
    api.patch(`/admin/users/${id}/status`, { is_active: isActive, ...(reason ? { reason } : {}) }).then((r) => r.data),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),
}
