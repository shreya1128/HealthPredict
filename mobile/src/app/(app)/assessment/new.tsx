import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { healthApi } from '@/api/health';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { TextField } from '@/components/ui/TextField';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { buildAssessmentPayload, EMPTY_ASSESSMENT_FORM, type AssessmentErrors, type AssessmentForm } from '@/utils/assessment';

export default function NewAssessment() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const [form, setForm] = useState<AssessmentForm>(EMPTY_ASSESSMENT_FORM);
  const [errors, setErrors] = useState<AssessmentErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const diaRef = useRef<TextInput>(null);
  const hrRef = useRef<TextInput>(null);
  const glucoseRef = useRef<TextInput>(null);
  const spo2Ref = useRef<TextInput>(null);
  const tempRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  const set = (key: keyof AssessmentForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const { payload, errors: found } = buildAssessmentPayload(form);
    setErrors(found);
    setServerError(null);
    if (!payload) return;

    setLoading(true);
    try {
      const created = await healthApi.createAssessment(payload);
      router.replace({ pathname: '/assessment/[id]', params: { id: String(created.id) } });
    } catch (e) {
      const err = toApiError(e);
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const numeric = { keyboardType: 'numeric' as const, autoCorrect: false, returnKeyType: 'next' as const };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText color="textMuted">
          Enter the readings you have. You don&apos;t need every field, but at least one measurement is required. Each submission is saved as a new assessment; your trend charts keep the latest one for each day.
        </AppText>

        <View style={styles.form}>
          {errors.form ? <Banner kind="error" message={errors.form} /> : null}
          {serverError ? <Banner kind="error" message={serverError} /> : null}

          <AppText variant="overline" color="textSubtle" style={styles.group}>Blood pressure</AppText>
          <View style={styles.pair}>
            <View style={styles.half}>
              <TextField label="Systolic (top)" leftIcon="heart-pulse" value={form.systolic} onChangeText={set('systolic')} error={errors.systolic} placeholder="120" hint="mmHg" maxLength={3} {...numeric} onSubmitEditing={() => diaRef.current?.focus()} />
            </View>
            <View style={styles.half}>
              <TextField ref={diaRef} label="Diastolic (bottom)" value={form.diastolic} onChangeText={set('diastolic')} error={errors.diastolic} placeholder="80" hint="mmHg" maxLength={3} {...numeric} onSubmitEditing={() => hrRef.current?.focus()} />
            </View>
          </View>

          <AppText variant="overline" color="textSubtle" style={styles.group}>Other readings</AppText>
          <TextField ref={hrRef} label="Heart rate" leftIcon="heart" value={form.heartRate} onChangeText={set('heartRate')} error={errors.heartRate} placeholder="72" hint="beats per minute" maxLength={3} {...numeric} onSubmitEditing={() => glucoseRef.current?.focus()} />
          <TextField ref={glucoseRef} label="Blood glucose" leftIcon="water-percent" value={form.glucose} onChangeText={set('glucose')} error={errors.glucose} placeholder="95" hint="mg/dL" maxLength={3} {...numeric} onSubmitEditing={() => spo2Ref.current?.focus()} />
          <TextField ref={spo2Ref} label="Oxygen saturation (SpO2)" leftIcon="lungs" value={form.spo2} onChangeText={set('spo2')} error={errors.spo2} placeholder="98" hint="percent" maxLength={6} {...numeric} onSubmitEditing={() => tempRef.current?.focus()} />
          <TextField ref={tempRef} label="Body temperature" leftIcon="thermometer" value={form.temperature} onChangeText={set('temperature')} error={errors.temperature} placeholder="36.8" hint="°C" maxLength={5} {...numeric} onSubmitEditing={() => notesRef.current?.focus()} />

          <TextField ref={notesRef} label="Notes (optional)" leftIcon="note-text-outline" value={form.notes} onChangeText={set('notes')} placeholder="Anything worth remembering?" multiline maxLength={2000} />

          <Button label="Calculate my results" icon="check-circle-outline" onPress={() => void submit()} loading={loading} />
        </View>
        <Disclaimer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  form: { marginTop: 18 },
  group: { marginTop: 4, marginBottom: 10 },
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
