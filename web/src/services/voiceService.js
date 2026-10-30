import { api } from './api'

export const voiceService = {
  parseTranscript: async (transcript) => {
    const res = await api.post('/health/voice/parse', { transcript })
    return res.data
  },

  confirmSave: async (metric_type, fields, target_date = null) => {
    const res = await api.post('/health/voice/confirm-save', {
      metric_type,
      fields,
      target_date,
    })
    return res.data
  },
}
