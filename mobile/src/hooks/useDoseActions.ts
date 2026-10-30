import { useCallback, useState } from 'react';

import { toApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import type { ScheduleEntry } from '@/api/types';
import { syncMedicineReminders } from '@/notifications/medicineReminders';

/**
 * Logs a dose as taken or skipped via the backend, then refreshes the caller's data and the on-device reminders
 * (a dose that was just logged must not still fire a reminder). One action at a time per dose.
 */
export function useDoseActions(userId: number, onChanged: () => Promise<void> | void) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    async (entry: Pick<ScheduleEntry, 'id' | 'medicine_id'>, kind: 'taken' | 'skipped') => {
      setBusyId(entry.id);
      setError(null);
      try {
        if (kind === 'taken') await medicinesApi.markTaken(entry.medicine_id, entry.id);
        else await medicinesApi.markSkipped(entry.medicine_id, entry.id);
        await onChanged();
        void syncMedicineReminders(userId).catch(() => undefined);
      } catch (e) {
        setError(toApiError(e).message);
      } finally {
        setBusyId(null);
      }
    },
    [onChanged, userId],
  );

  return { act, busyId, error, clearError: () => setError(null) };
}
