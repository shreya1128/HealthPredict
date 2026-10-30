import { api } from './api';

export const menstrualService = {
  getLogs: async (limit = 50) => {
    const res = await api.get('/health/menstrual/logs', { params: { limit } });
    return res.data;
  },

  createLog: async (payload) => {
    const res = await api.post('/health/menstrual/logs', payload);
    return res.data;
  },

  deleteLog: async (logId) => {
    await api.delete(`/health/menstrual/logs/${logId}`);
  },

  getAnalytics: async () => {
    const res = await api.get('/health/menstrual/analytics');
    return res.data;
  },

  evaluatePcos: async (payload) => {
    const res = await api.post('/health/menstrual/pcos/evaluate', payload);
    return res.data;
  },

  submitPcosScreening: async (payload) => {
    const res = await api.post('/health/menstrual/pcos/screen', payload);
    return res.data;
  },
};
