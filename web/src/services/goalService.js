import { api } from './api'

export const goalService = {
  list: (status) => api.get('/goals', { params: status ? { status } : {} }).then((r) => r.data),
  get: (id) => api.get(`/goals/${id}`).then((r) => r.data),
  create: (payload) => api.post('/goals', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/goals/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/goals/${id}`),
  logProgress: (id, payload) => api.post(`/goals/${id}/progress`, payload).then((r) => r.data),
  history: (id) => api.get(`/goals/${id}/progress`).then((r) => r.data),
  recommendations: () => api.get('/goals/recommendations').then((r) => r.data),
}

