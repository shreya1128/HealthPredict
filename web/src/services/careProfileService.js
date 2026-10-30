import { api } from './api'

export const careProfileService = {
  list: () => api.get('/care-profiles').then((r) => r.data),
  create: (data) => api.post('/care-profiles', data).then((r) => r.data),
  update: (id, data) => api.put(`/care-profiles/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/care-profiles/${id}`),
  listCaregivers: () => api.get('/care-profiles/caregivers/invites').then((r) => r.data),
  inviteCaregiver: (data) => api.post('/care-profiles/caregivers/invite', data).then((r) => r.data),
  revokeCaregiver: (id) => api.delete(`/care-profiles/caregivers/invite/${id}`),
}

export const drugIntelligenceService = {
  searchNames: (query) => api.get('/medicines/search-names', { params: { query } }).then((r) => r.data),
  checkInteractions: (rxcuis) => api.get('/medicines/check-interactions', { params: { rxcuis } }).then((r) => r.data),
}

export const doctorSummaryService = {
  createShare: (params) => api.post('/reports/doctor-summary/share', null, { params }).then((r) => r.data),
  listShares: () => api.get('/reports/doctor-summary/shares').then((r) => r.data),
  revokeShare: (id) => api.delete(`/reports/doctor-summary/share/${id}`),
  getPublicSummary: (token) => api.get(`/reports/doctor-summary/public/${token}`).then((r) => r.data),
  submitNotes: (token, data) => api.post(`/reports/doctor-summary/public/${token}/notes`, data).then((r) => r.data),
}
