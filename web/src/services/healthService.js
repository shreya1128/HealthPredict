import { api } from './api'

export const healthService = {
  createAssessment: (vitals) => api.post('/health/assessment', vitals).then((r) => r.data),
  getAssessment: (id) => api.get(`/health/assessment/${id}`).then((r) => r.data),
  recalculate: (id) => api.post(`/health/assessment/${id}/recalculate`).then((r) => r.data),
  recalculateLatest: () => api.post('/health/assessment/recalculate-latest').then((r) => r.data),
  getLatestAssessment: () => api.get('/health/assessment/latest').then((r) => r.data),
  listAssessments: (page = 1, pageSize = 20) =>
    api.get('/health/assessment/history', { params: { page, page_size: pageSize } }).then((r) => r.data),
  getHistory: (days = 90) => api.get('/health/history', { params: { days } }).then((r) => r.data),
}

export const profileService = {
  get: () => api.get('/profile').then((r) => r.data),
  update: (payload) => api.put('/profile', payload).then((r) => r.data),
}
