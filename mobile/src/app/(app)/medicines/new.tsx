import { useRouter } from 'expo-router';
import { useState } from 'react';

import { toApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import { useUser } from '@/auth/AuthContext';
import { MedicineForm } from '@/components/medicine/MedicineForm';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { syncMedicineReminders } from '@/notifications/medicineReminders';
import { buildCreatePayload, emptyMedicineForm, mapServerErrors, type MedicineFormErrors, type MedicineFormState } from '@/utils/medicineForm';

export default function NewMedicine() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const userId = useUser().id;
  const [errors, setErrors] = useState<MedicineFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => emptyMedicineForm());

  async function submit(state: MedicineFormState) {
    const { payload, errors: found } = buildCreatePayload(state);
    setErrors(found);
    setServerError(null);
    if (!payload) return;
    setSaving(true);
    try {
      const created = await medicinesApi.create(payload);
      void syncMedicineReminders(userId).catch(() => undefined);
      router.replace({ pathname: '/medicines/[id]', params: { id: String(created.id) } });
    } catch (e) {
      const err = toApiError(e);
      const mapped = mapServerErrors(err.fieldErrors, err.message);
      setErrors(mapped.errors);
      setServerError(mapped.banner);
    } finally {
      setSaving(false);
    }
  }

  return <MedicineForm mode="create" initial={initial} errors={errors} serverError={serverError} submitting={saving} onSubmit={(s) => void submit(s)} />;
}
