import { toNum } from '@/utils/num';

import { api } from './client';
import type { WeeklyReport, WeeklyReportSummary } from './types';

const normalizeReport = (report: WeeklyReport): WeeklyReport => ({
  ...report,
  average_health_score: toNum(report.average_health_score),
  weight_change_kg: toNum(report.weight_change_kg),
  total_exercise_minutes: toNum(report.total_exercise_minutes),
  average_sleep_duration: toNum(report.average_sleep_duration),
  average_hydration_ml: toNum(report.average_hydration_ml),
  medicine_adherence_percent: toNum(report.medicine_adherence_percent),
  goals_progress_percent: toNum(report.goals_progress_percent),
  significant_changes: report.significant_changes ?? [],
  recommendations: report.recommendations ?? [],
});

export const reportsApi = {
  async weekly(weekStart?: string): Promise<WeeklyReport> {
    const { data } = await api.get<WeeklyReport>('/reports/weekly', { params: weekStart ? { week_start: weekStart } : undefined });
    return normalizeReport(data);
  },
  async history(): Promise<WeeklyReportSummary[]> {
    const { data } = await api.get<WeeklyReportSummary[]>('/reports/weekly/history');
    return data.map((row) => ({
      ...row,
      average_health_score: toNum(row.average_health_score),
      medicine_adherence_percent: toNum(row.medicine_adherence_percent),
    }));
  },
  /** Fetch the PDF through the shared authenticated client; callers save/share the returned bytes. */
  async pdf(reportId: number): Promise<ArrayBuffer> {
    const { data } = await api.get<ArrayBuffer>(`/reports/weekly/${reportId}/pdf`, { responseType: 'arraybuffer' });
    return data;
  },
};
