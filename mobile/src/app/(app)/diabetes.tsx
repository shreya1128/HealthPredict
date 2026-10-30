import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { healthApi } from '@/api/health';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors, radius } from '@/theme';

const AGE_GROUPS = [
  { value: 'under_45', label: 'Under 45' },
  { value: '45_54', label: '45–54' },
  { value: '55_64', label: '55–64' },
  { value: '65_plus', label: '65+' },
];

const WAIST_GROUPS = [
  { value: 'normal', label: 'Normal' },
  { value: 'elevated', label: 'Elevated' },
  { value: 'high', label: 'High' },
];

const ACTIVITY_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const FAMILY_HISTORY = [
  { value: 'none', label: 'None' },
  { value: 'grandparent_uncle_aunt_cousin', label: 'Distant' },
  { value: 'parent_sibling_child', label: 'Close' },
];

interface FormState {
  age_group: string | null;
  bmi: string;
  waist_circumference: string | null;
  physical_activity: string | null;
  daily_vegetables_fruits: string | null;
  hypertension_medication: string | null;
  history_high_glucose: string | null;
  family_diabetes_history: string | null;
}

const EMPTY_FORM: FormState = {
  age_group: null,
  bmi: '',
  waist_circumference: null,
  physical_activity: null,
  daily_vegetables_fruits: null,
  hypertension_medication: null,
  history_high_glucose: null,
  family_diabetes_history: null,
};

type ScreeningResult = {
  total_score: number;
  risk_level: string;
  interpretation: string;
  recommendations: string[];
  disclaimer: string;
};

/** Diabetes risk screening based on the FINDRISC questionnaire. Educational only. */
export default function DiabetesScreen() {
  useStatusBarStyle('dark');
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: history, loading: histLoading, error: histError, reload } = useApiQuery(
    () => healthApi.diabetesHistory(),
  );

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleCalculate() {
    setError(null);
    // Basic validation
    if (!form.age_group || !form.bmi || !form.waist_circumference || !form.physical_activity) {
      setError('Please fill in all required fields.');
      return;
    }
    const bmiVal = parseFloat(form.bmi);
    if (isNaN(bmiVal) || bmiVal < 10 || bmiVal > 80) {
      setError('BMI should be between 10 and 80.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        age_group: form.age_group,
        bmi: bmiVal,
        waist_circumference: form.waist_circumference,
        physical_activity: form.physical_activity,
        daily_vegetables_fruits: form.daily_vegetables_fruits === 'yes',
        hypertension_medication: form.hypertension_medication === 'yes',
        history_high_glucose: form.history_high_glucose === 'yes',
        family_diabetes_history: form.family_diabetes_history ?? 'none',
      };
      const res = await healthApi.diabetesCalculate(payload);
      setResult(res);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      const bmiVal = parseFloat(form.bmi);
      const payload = {
        age_group: form.age_group,
        bmi: bmiVal,
        waist_circumference: form.waist_circumference,
        physical_activity: form.physical_activity,
        daily_vegetables_fruits: form.daily_vegetables_fruits === 'yes',
        hypertension_medication: form.hypertension_medication === 'yes',
        history_high_glucose: form.history_high_glucose === 'yes',
        family_diabetes_history: form.family_diabetes_history ?? 'none',
      };
      await healthApi.diabetesScreen(payload);
      Alert.alert('Saved', 'Your screening result has been saved.');
      setResult(null);
      setForm({ ...EMPTY_FORM });
      reload();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  const riskColor = (level: string) => {
    if (level?.toLowerCase().includes('low')) return colors.success;
    if (level?.toLowerCase().includes('moderate')) return colors.warning;
    return colors.danger;
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="h1">Diabetes Risk</AppText>
        <AppText color="textMuted" style={styles.intro}>
          This screening uses the FINDRISC questionnaire to estimate type 2 diabetes risk. It is not a diagnosis.
        </AppText>

        <Banner kind="info" message="This is an educational screening tool. Consult a healthcare professional for medical advice." />

        {error ? <Banner kind="error" message={error} /> : null}

        {result ? (
          <View style={styles.section}>
            <Card style={styles.resultCard}>
              <AppText variant="h2">Your Result</AppText>
              <View style={[styles.scoreBadge, { backgroundColor: riskColor(result.risk_level) + '20' }]}>
                <AppText variant="display" style={{ color: riskColor(result.risk_level) }}>
                  {result.total_score}
                </AppText>
                <AppText variant="bodyStrong" style={{ color: riskColor(result.risk_level) }}>
                  {result.risk_level}
                </AppText>
              </View>
              <AppText color="textMuted">{result.interpretation}</AppText>
              {result.recommendations?.length > 0 ? (
                <View style={styles.recs}>
                  <AppText variant="label" color="textSubtle">Recommendations</AppText>
                  {result.recommendations.map((r, i) => (
                    <AppText key={i} color="textMuted" style={styles.recItem}>• {r}</AppText>
                  ))}
                </View>
              ) : null}
              <AppText variant="caption" color="textSubtle" style={styles.disclaimer}>
                {result.disclaimer}
              </AppText>
            </Card>
            <Button label="Save result" icon="content-save-outline" onPress={() => void handleSave()} loading={saving} />
            <Button label="Start over" variant="secondary" onPress={() => { setResult(null); setForm({ ...EMPTY_FORM }); }} />
          </View>
        ) : (
          <View style={styles.section}>
            <ChipSelect label="Age group *" options={AGE_GROUPS} value={form.age_group} onChange={set('age_group')} />
            <TextField label="BMI *" leftIcon="scale-bathroom" value={form.bmi} onChangeText={set('bmi')} placeholder="25.0" hint="Body Mass Index (kg/m²)" keyboardType="decimal-pad" maxLength={5} />
            <ChipSelect label="Waist circumference *" options={WAIST_GROUPS} value={form.waist_circumference} onChange={set('waist_circumference')} hint="Normal: M<94cm/F<80cm · Elevated: M 94-102/F 80-88 · High: M>102/F>88" />
            <ChipSelect label="Physical activity *" options={ACTIVITY_OPTIONS} value={form.physical_activity} onChange={set('physical_activity')} hint="At least 30 min/day of moderate activity?" />
            <ChipSelect label="Daily fruits & vegetables?" options={YES_NO} value={form.daily_vegetables_fruits} onChange={set('daily_vegetables_fruits')} />
            <ChipSelect label="Hypertension medication?" options={YES_NO} value={form.hypertension_medication} onChange={set('hypertension_medication')} />
            <ChipSelect label="History of high blood glucose?" options={YES_NO} value={form.history_high_glucose} onChange={set('history_high_glucose')} />
            <ChipSelect label="Family history of diabetes?" options={FAMILY_HISTORY} value={form.family_diabetes_history} onChange={set('family_diabetes_history')} />

            <Button label="Calculate risk" icon="calculator-variant-outline" onPress={() => void handleCalculate()} loading={saving} />
          </View>
        )}

        {/* History */}
        <SectionHeader title="Previous screenings" />
        {histLoading ? <LoadingView /> : null}
        {histError ? <ErrorState error={histError} onRetry={() => void reload()} /> : null}
        {!histLoading && !histError && history?.length === 0 ? (
          <AppText color="textSubtle">No previous screenings.</AppText>
        ) : null}
        {history?.map((item: any, idx: number) => (
          <Card key={item.id ?? idx} style={styles.histCard}>
            <View style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{item.risk_level}</AppText>
                <AppText variant="caption" color="textSubtle">Score: {item.total_score}</AppText>
              </View>
              <AppText variant="caption" color="textSubtle">
                {item.screened_at ? new Date(item.screened_at).toLocaleDateString() : ''}
              </AppText>
            </View>
          </Card>
        ))}

        <View style={styles.footer}>
          <Disclaimer />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  intro: { marginTop: 4, marginBottom: 12 },
  section: { marginTop: 8, gap: 12 },
  resultCard: { gap: 12 },
  scoreBadge: { alignSelf: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: radius.xl },
  recs: { gap: 4 },
  recItem: { paddingLeft: 8 },
  disclaimer: { marginTop: 8, fontStyle: 'italic' },
  histCard: { marginTop: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { marginTop: 24 },
});
