import { api } from './api'

export const timelineService = {
  getTimeline: async (params = {}) => {
    const res = await api.get('/health/timeline', { params })
    return res.data
  },
}
