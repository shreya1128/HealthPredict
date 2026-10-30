import { toNum, coerce } from '@/utils/num';

import { api } from './client';
import { ApiError } from './errors';
import type { Assessment, AssessmentCreate, AssessmentPage, AssessmentSummary, HistoryPoint, HistoryResponse } from './types';

const ASSESSMENT_NUMBERS = ['health_score', 'data_completeness_percent', 'spo2_percent', 'temperature_celsius'] as const;

export function normalizeAssessment(raw: Assessment): Assessment {
  return {
    ...coerce(raw, ASSESSMENT_NUMBERS),
    score_breakdown: raw.score_breakdown ?? null,
    ml_prediction: raw.ml_prediction ?? null,
    ml_prediction_missing_fields: raw.ml_prediction_missing_fields ?? [],
    profile_hints: raw.profile_hints ?? [],
  };
}

const normalizeSummary = (s: AssessmentSummary): AssessmentSummary => coerce(s, ['health_score', 'data_completeness_percent']);
const normalizePoint = (p: HistoryPoint): HistoryPoint => coerce(p, ['health_score', 'bmi', 'weight_kg', 'spo2_percent']);

export const healthApi = {
  async createAssessment(payload: AssessmentCreate): Promise<Assessment> {
    const { data } = await api.post<Assessment>('/health/assessment', payload);
    return normalizeAssessment(data);
  },

  /** `null` when the user has not completed any assessment yet (the backend answers 404). */
  async latest(): Promise<Assessment | null> {
    try {
      const { data } = await api.get<Assessment>('/health/assessment/latest');
      return normalizeAssessment(data);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'not_found') return null;
      throw e;
    }
  },

  async get(id: number): Promise<Assessment> {
    const { data } = await api.get<Assessment>(`/health/assessment/${id}`);
    return normalizeAssessment(data);
  },

  async list(page = 1, pageSize = 20): Promise<AssessmentPage> {
    const { data } = await api.get<AssessmentPage>('/health/assessment/history', { params: { page, page_size: pageSize } });
    return { ...data, items: data.items.map(normalizeSummary) };
  },

  async history(days: number): Promise<HistoryResponse> {
    const { data } = await api.get<HistoryResponse>('/health/history', { params: { days } });
    return { ...data, points: data.points.map(normalizePoint) };
  },

  async timeline(params: { categories?: string; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}): Promise<{ total_events: number; events: any[] }> {
    const { data } = await api.get<{ total_events: number; events: any[] }>('/health/timeline', { params });
    return data;
  },

  // Diabetes risk screening (FINDRISC / ADA non-invasive standard)
  async diabetesCalculate(payload: any): Promise<any> {
    const { data } = await api.post('/health/diabetes/calculate', payload);
    return data;
  },
  async diabetesScreen(payload: any): Promise<any> {
    const { data } = await api.post('/health/diabetes/screen', payload);
    return data;
  },
  async diabetesHistory(): Promise<any[]> {
    const { data } = await api.get<any[]>('/health/diabetes/history');
    return data;
  },

  // Menstrual cycle tracking & PCOS educational support
  async menstrualLogs(limit = 20): Promise<any[]> {
    const { data } = await api.get<any[]>('/health/menstrual/logs', { params: { limit } });
    return data;
  },
  async createMenstrualLog(payload: any): Promise<any> {
    const { data } = await api.post('/health/menstrual/logs', payload);
    return data;
  },
  async deleteMenstrualLog(logId: number): Promise<void> {
    await api.delete(`/health/menstrual/logs/${logId}`);
  },
  async cycleAnalytics(): Promise<any> {
    const { data } = await api.get('/health/menstrual/analytics');
    return data;
  },
  async pcosEvaluate(payload: any): Promise<any> {
    const { data } = await api.post('/health/menstrual/pcos/evaluate', payload);
    return data;
  },
  async pcosScreen(payload: any): Promise<any> {
    const { data } = await api.post('/health/menstrual/pcos/screen', payload);
    return data;
  },

  // Fatty liver (MASLD) risk awareness
  async fattyLiverEvaluate(payload: any): Promise<any> {
    const { data } = await api.post('/health/fatty-liver/evaluate', payload);
    return data;
  },
  async fattyLiverScreen(payload: any): Promise<any> {
    const { data } = await api.post('/health/fatty-liver/screen', payload);
    return data;
  },
  async fattyLiverHistory(): Promise<any[]> {
    const { data } = await api.get<any[]>('/health/fatty-liver/history');
    return data;
  },
};

export { toNum };
