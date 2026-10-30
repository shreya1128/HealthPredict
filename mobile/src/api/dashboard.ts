import { coerce, toNum } from '@/utils/num';

import { api } from './client';
import { normalizeAssessment } from './health';
import type { Dashboard } from './types';

export const dashboardApi = {
  async get(): Promise<Dashboard> {
    const { data } = await api.get<Dashboard>('/dashboard');
    return {
      ...data,
      latest_assessment: data.latest_assessment ? normalizeAssessment(data.latest_assessment) : null,
      active_goals: (data.active_goals ?? []).map((g) => ({ ...coerce(g, ['target_value', 'current_value', 'percentage_complete']) })),
      today_medicines: data.today_medicines ?? [],
      insights: data.insights ?? [],
      hydration_today: { ...data.hydration_today, percent_of_goal: toNum(data.hydration_today.percent_of_goal) },
    };
  },
};
