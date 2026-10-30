import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { toApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import type { Medicine } from '@/api/types';
import { useUser } from '@/auth/AuthContext';
import { MedicineForm } from '@/components/medicine/MedicineForm';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useSafeBack } from '@/hooks/useSafeBack';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { syncMedicineReminders } from '@/notifications/medicineReminders';
import { buildUpdateChanges, formFromMedicine, mapServerErrors, type MedicineFormErrors, type MedicineFormState } from '@/utils/medicineForm';

export default function EditMedicine() {
  useStatusBarStyle('dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApiQuery(() => medicinesApi.get(Number(id)));

  if (loading) return <LoadingView label="Loading medicine…" />;
  if (error) return <ErrorState error={error} onRetry={() => void reload()} />;
  return data ? <Editor medicine={data} /> : null;
}

function Editor({ medicine }: { medicine: Medicine }) {
  const goBack = useSafeBack('/medicines');
  const userId = useUser().id;
  const [errors, setErrors] = useState<MedicineFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => formFromMedicine(medicine));

  async function submit(state: MedicineFormState) {
    const { changes, errors: found } = buildUpdateChanges(medicine, state);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(changes).length === 0) {
      goBack();
      return;
    }
    setSaving(true);
    try {
      await medicinesApi.update(medicine.id, changes);
      void syncMedicineReminders(userId).catch(() => undefined);
      goBack();
    } catch (e) {
      const err = toApiError(e);
      const mapped = mapServerErrors(err.fieldErrors, err.message);
      setErrors(mapped.errors);
      setServerError(mapped.banner);
    } finally {
      setSaving(false);
    }
  }

  return <MedicineForm mode="edit" initial={initial} errors={errors} serverError={serverError} submitting={saving} onSubmit={(s) => void submit(s)} />;
}
