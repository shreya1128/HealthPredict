import { coerce } from '@/utils/num';

import { api } from './client';
import type { HealthProfile, ProfileUpdate } from './types';

const NUMBERS = ['height_cm', 'weight_kg', 'bmi', 'waist_circumference_cm', 'sleep_duration_hours'] as const;

export const profileApi = {
  async get(): Promise<HealthProfile> {
    const { data } = await api.get<HealthProfile>('/profile');
    return coerce(data, NUMBERS);
  },
  async update(changes: ProfileUpdate): Promise<HealthProfile> {
    const { data } = await api.put<HealthProfile>('/profile', changes);
    return coerce(data, NUMBERS);
  },
};
