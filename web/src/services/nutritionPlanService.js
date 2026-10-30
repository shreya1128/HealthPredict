import { api } from './api'

export const nutritionPlanService = {
  getCatalog: async (params = {}) => {
    const res = await api.get('/nutrition/catalog', { params })
    return res.data
  },

  generateMealPlan: async (preferences) => {
    const res = await api.post('/nutrition/meal-plan', preferences)
    return res.data
  },

  getSubstitutions: async (foodId) => {
    const res = await api.get(`/nutrition/substitutions/${foodId}`)
    return res.data
  },
}
