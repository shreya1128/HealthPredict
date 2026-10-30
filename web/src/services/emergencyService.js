import { api } from './api'

export const emergencyService = {
  getCard: () => api.get('/health/emergency-card').then((r) => r.data),
  updateCard: (data) => api.put('/health/emergency-card', data).then((r) => r.data),
  setVisibility: (is_public, consent_acknowledged = true) =>
    api.patch('/health/emergency-card/visibility', null, { params: { is_public, consent_acknowledged } }).then((r) => r.data),
  regenerateLink: () => api.post('/health/emergency-card/regenerate-link').then((r) => r.data),
  getPublicCard: (token) => api.get(`/health/emergency-card/public/${token}`).then((r) => r.data),
  getCardQrSvg: () => api.get('/health/emergency-card/qr', { responseType: 'text' }).then((r) => r.data),
  getPublicCardQrSvg: (token) => api.get(`/health/emergency-card/public/${token}/qr`, { responseType: 'text' }).then((r) => r.data),
  logSymptom: (data) => api.post('/health/symptoms', data).then((r) => r.data),
  listSymptoms: (days = 30) => api.get('/health/symptoms', { params: { days } }).then((r) => r.data),
  getSymptomAnalytics: (days = 30) => api.get('/health/symptoms/analytics', { params: { days } }).then((r) => r.data),
  createAppointment: (data) => api.post('/health/appointments', data).then((r) => r.data),
  listAppointments: () => api.get('/health/appointments').then((r) => r.data),
  updateAppointment: (id, data) => api.put(`/health/appointments/${id}`, data).then((r) => r.data),
  deleteAppointment: (id) => api.delete(`/health/appointments/${id}`),
  getAppointmentPrep: (id) => api.get(`/health/appointments/${id}/prep`).then((r) => r.data),
}

