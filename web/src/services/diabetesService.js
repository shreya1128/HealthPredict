import { api } from './api';

export const diabetesService = {
  calculateRisk: async (payload) => {
    const res = await api.post('/health/diabetes/calculate', payload);
    return res.data;
  },

  submitScreening: async (payload) => {
    const res = await api.post('/health/diabetes/screen', payload);
    return res.data;
  },

  getHistory: async (limit = 20) => {
    const res = await api.get('/health/diabetes/history', { params: { limit } });
    return res.data;
  },
};
