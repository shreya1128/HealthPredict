import { api } from './api'

export const medicineService = {
  list: (activeOnly = false) => api.get('/medicines', { params: { active_only: activeOnly } }).then((r) => r.data),
  get: (id) => api.get(`/medicines/${id}`).then((r) => r.data),
  create: (payload) => api.post('/medicines', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/medicines/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/medicines/${id}`),
  schedule: (id, pastDays = 7, upcomingDays = 14) =>
    api.get(`/medicines/${id}/schedule`, { params: { past_days: pastDays, upcoming_days: upcomingDays } }).then((r) => r.data),
  today: () => api.get('/medicines/today').then((r) => r.data),
  markTaken: (medicineId, scheduleId) =>
    api.post(`/medicines/${medicineId}/schedule/${scheduleId}/taken`).then((r) => r.data),
  markSkipped: (medicineId, scheduleId, reason) =>
    api.post(`/medicines/${medicineId}/schedule/${scheduleId}/skipped`, { reason }).then((r) => r.data),
  adherence: (id, days = 30) => api.get(`/medicines/${id}/adherence`, { params: { days } }).then((r) => r.data),
  searchNames: (query) => api.get('/medicines/search-names', { params: { query } }).then((r) => r.data),
  checkInteractions: (drugNames) => api.post('/medicines/check-interactions', null, { params: { drug_names: drugNames } }).then((r) => r.data),
  refill: (id, quantity, pharmacyNote) => api.post(`/medicines/${id}/refill`, { quantity, pharmacy_note: pharmacyNote }).then((r) => r.data),
}

