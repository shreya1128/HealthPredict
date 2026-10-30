import { api } from './api';

export const fattyLiverService = {
  evaluate: async (payload) => {
    const res = await api.post('/health/fatty-liver/evaluate', payload);
    return res.data;
  },

  screen: async (payload) => {
    const res = await api.post('/health/fatty-liver/screen', payload);
    return res.data;
  },

  getHistory: async (limit = 20) => {
    const res = await api.get('/health/fatty-liver/history', { params: { limit } });
    return res.data;
  },
};
