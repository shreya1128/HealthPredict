import { api } from './api'

export const trackingService = {
  exercise: {
    list: (days = 30) => api.get('/exercise', { params: { days } }).then((r) => r.data),
    create: (payload) => api.post('/exercise', payload).then((r) => r.data),
    remove: (id) => api.delete(`/exercise/${id}`),
    weekly: (days = 7) => api.get('/exercise/weekly', { params: { days } }).then((r) => r.data),
  },
  sleep: {
    list: (days = 30) => api.get('/sleep', { params: { days } }).then((r) => r.data),
    create: (payload) => api.post('/sleep', payload).then((r) => r.data),
    remove: (id) => api.delete(`/sleep/${id}`),
    weekly: (days = 7) => api.get('/sleep/weekly', { params: { days } }).then((r) => r.data),
  },
  hydration: {
    list: (days = 7) => api.get('/hydration', { params: { days } }).then((r) => r.data),
    create: (payload) => api.post('/hydration', payload).then((r) => r.data),
    remove: (id) => api.delete(`/hydration/${id}`),
    daily: () => api.get('/hydration/daily').then((r) => r.data),
  },
  nutrition: {
    list: (days = 7) => api.get('/nutrition', { params: { days } }).then((r) => r.data),
    create: (payload) => api.post('/nutrition', payload).then((r) => r.data),
    remove: (id) => api.delete(`/nutrition/${id}`),
    daily: () => api.get('/nutrition/daily').then((r) => r.data),
  },
  wearables: {
    sync: (payload) => api.post('/wearables/sync', payload).then((r) => r.data),
    deleteSimulated: () => api.delete('/wearables/simulated').then((r) => r.data),
  },
  correlations: {
    get: (days = 30) => api.get('/correlations', { params: { days } }).then((r) => r.data),
  },
}

