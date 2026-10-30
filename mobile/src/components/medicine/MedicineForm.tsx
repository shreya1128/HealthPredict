import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import type { FrequencyUnit, MedicineFormType } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { TextField } from '@/components/ui/TextField';
import { colors } from '@/theme';

import { TimeListField } from './TimeListField';
import { FORM_LABELS, FREQUENCY_LABELS } from '@/utils/medicineDisplay';
import { timesAllowed, type MedicineFormErrors, type MedicineFormState } from '@/utils/medicineForm';
import { formatDateInput } from '@/utils/validation';

const FORMS = (Object.keys(FORM_LABELS) as MedicineFormType[]).map((v) => ({ value: v, label: FORM_LABELS[v] }));
const FREQUENCIES = (['DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED'] as FrequencyUnit[]).map((v) => ({ value: v, label: FREQUENCY_LABELS[v] }));
const UNITS = ['mg', 'mcg', 'g', 'ml', 'IU'].map((u) => ({ value: u, label: u }));

const FREQUENCY_HINT: Record<FrequencyUnit, string> = {
  DAILY: 'Add every time of day you take it.',
  WEEKLY: 'One dose every 7 days, on the same weekday as the start date.',
  MONTHLY: 'One dose every 30 days from the start date.',
  AS_NEEDED: 'No schedule: this medicine is kept on your list but has no scheduled doses or reminders.',
};

export interface MedicineFormProps {
  mode: 'create' | 'edit';
  initial: MedicineFormState;
  errors: MedicineFormErrors;
  serverError: string | null;
  submitting: boolean;
  onSubmit: (state: MedicineFormState) => void;

}

export function MedicineForm({ mode, initial, errors, serverError, submitting, onSubmit }: MedicineFormProps) {
  const [f, setF] = useState<MedicineFormState>(initial);
  const set = <K extends keyof MedicineFormState>(key: K) => (value: MedicineFormState[K]) => setF((s) => ({ ...s, [key]: value }));

  function changeFrequency(next: FrequencyUnit) {
    setF((s) => {
      const max = timesAllowed(next);
      let times = s.times;
      if (next === 'AS_NEEDED') times = [];
      else if (times.length === 0) times = ['08:00'];
      else if (times.length > max) times = times.slice(0, max);
      return { ...s, frequency: next, times };
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {serverError ? <Banner kind="error" message={serverError} /> : null}

        <TextField label="Medicine name" leftIcon="pill" value={f.name} onChangeText={set('name')} error={errors.name} placeholder="e.g. Metformin" autoCapitalize="words" maxLength={255} />

        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Dosage (optional)" value={f.dosage} onChangeText={set('dosage')} error={errors.dosage} placeholder="500" keyboardType="decimal-pad" maxLength={9} />
          </View>
          <View style={styles.flex}>
            <TextField label="Unit" value={f.unit} onChangeText={set('unit')} error={errors.unit} placeholder="mg" autoCapitalize="none" maxLength={50} />
          </View>
        </View>
        <ChipSelect label="Common units" options={UNITS} value={UNITS.some((u) => u.value === f.unit) ? f.unit : null} onChange={set('unit')} />

        <ChipSelect label="Form" options={FORMS} value={f.form} onChange={set('form')} error={errors.form} />
        <ChipSelect label="How often?" options={FREQUENCIES} value={f.frequency} onChange={changeFrequency} hint={FREQUENCY_HINT[f.frequency]} />

        {f.frequency !== 'AS_NEEDED' ? (
          <TimeListField times={f.times} onChange={set('times')} max={timesAllowed(f.frequency)} error={errors.times} />
        ) : null}

        {mode === 'create' ? (
          <TextField label="Start date" leftIcon="calendar-start" value={f.startDate} onChangeText={(t) => set('startDate')(formatDateInput(t))} error={errors.startDate} placeholder="2026-10-07" hint="YYYY-MM-DD" keyboardType="number-pad" maxLength={10} />
        ) : (
          <TextField label="Start date" leftIcon="calendar-start" value={f.startDate} editable={false} hint="The start date can't be changed after a medicine is added." />
        )}
        <TextField label="End date (optional)" leftIcon="calendar-end" value={f.endDate} onChangeText={(t) => set('endDate')(formatDateInput(t))} error={errors.endDate} placeholder="Leave empty if ongoing" hint="YYYY-MM-DD" keyboardType="number-pad" maxLength={10} />

        <TextField label="What is it for? (optional)" value={f.reason} onChangeText={set('reason')} placeholder="e.g. Blood sugar" maxLength={255} />
        <TextField label="Instructions (optional)" value={f.instructions} onChangeText={set('instructions')} placeholder="e.g. Take with food" multiline maxLength={2000} />
        <TextField label="Notes (optional)" value={f.notes} onChangeText={set('notes')} multiline maxLength={2000} />

        {mode === 'edit' ? (
          <AppText variant="caption" color="textSubtle" style={styles.rebuild}>
            Changing the frequency, times or end date rebuilds your upcoming doses. Doses you&apos;ve already logged are kept.
          </AppText>
        ) : null}

        <Button label={mode === 'create' ? 'Add medicine' : 'Save changes'} icon="content-save-outline" onPress={() => onSubmit(f)} loading={submitting} />
        <Disclaimer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  pair: { flexDirection: 'row', gap: 12 },
  rebuild: { marginBottom: 12 },
});
