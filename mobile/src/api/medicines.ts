import { coerce, toNum } from '@/utils/num';

import { api } from './client';
import type { Adherence, Medicine, MedicineCreate, MedicineUpdate, ScheduleEntry } from './types';

const normalizeMedicine = (m: Medicine): Medicine => ({ ...coerce(m, ['dosage']), time_of_day: m.time_of_day ?? [] });
const normalizeAdherence = (a: Adherence): Adherence => ({ ...a, adherence_percent: toNum(a.adherence_percent) });

/** Wrappers over the existing /medicines endpoints. Adherence is always computed by the server from real records. */
export const medicinesApi = {
  async list(): Promise<Medicine[]> {
    const { data } = await api.get<Medicine[]>('/medicines');
    return data.map(normalizeMedicine);
  },
  async get(id: number): Promise<Medicine> {
    const { data } = await api.get<Medicine>(`/medicines/${id}`);
    return normalizeMedicine(data);
  },
  async create(payload: MedicineCreate): Promise<Medicine> {
    const { data } = await api.post<Medicine>('/medicines', payload);
    return normalizeMedicine(data);
  },
  async update(id: number, changes: MedicineUpdate): Promise<Medicine> {
    const { data } = await api.put<Medicine>(`/medicines/${id}`, changes);
    return normalizeMedicine(data);
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/medicines/${id}`);
  },
  /** Today's doses across all ACTIVE medicines. */
  async today(): Promise<ScheduleEntry[]> {
    const { data } = await api.get<ScheduleEntry[]>('/medicines/today');
    return data;
  },
  async schedule(id: number, pastDays = 7, upcomingDays = 14): Promise<ScheduleEntry[]> {
    const { data } = await api.get<ScheduleEntry[]>(`/medicines/${id}/schedule`, { params: { past_days: pastDays, upcoming_days: upcomingDays } });
    return data;
  },
  async markTaken(medicineId: number, scheduleId: number): Promise<ScheduleEntry> {
    const { data } = await api.post<ScheduleEntry>(`/medicines/${medicineId}/schedule/${scheduleId}/taken`);
    return data;
  },
  async markSkipped(medicineId: number, scheduleId: number, reason?: string): Promise<ScheduleEntry> {
    const { data } = await api.post<ScheduleEntry>(`/medicines/${medicineId}/schedule/${scheduleId}/skipped`, reason ? { reason } : {});
    return data;
  },
  async adherence(id: number, days = 30): Promise<Adherence> {
    const { data } = await api.get<Adherence>(`/medicines/${id}/adherence`, { params: { days } });
    return normalizeAdherence(data);
  },
  /** All active medicines combined. `adherence_percent` is null when nothing has been scheduled yet. */
  async overallAdherence(days = 30): Promise<Adherence> {
    const { data } = await api.get<Adherence>('/medicines/adherence/overall', { params: { days } });
    return normalizeAdherence(data);
  },
};
