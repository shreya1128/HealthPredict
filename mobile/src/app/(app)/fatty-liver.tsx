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

const UNKNOWN_YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: "Don't know" },
];

const ALCOHOL_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'heavy', label: 'Heavy' },
];

interface FormState {
  bmi: string;
  waist_cm: string;
  has_diabetes: string | null;
  has_hypertension: string | null;
  high_triglycerides: string | null;
  low_hdl: string | null;
  alcohol_consumption: string | null;
  elevated_alt_ast: string | null;
}

const EMPTY_FORM: FormState = {
  bmi: '',
  waist_cm: '',
  has_diabetes: null,
  has_hypertension: null,
  high_triglycerides: null,
  low_hdl: null,
  alcohol_consumption: null,
  elevated_alt_ast: null,
};

type ScreeningResult = {
  risk_factors_present: number;
  risk_factors_total: number;
  risk_level: string;
  interpretation: string;
  risk_factors_detail: any[];
  recommendations: string[];
  disclaimer: string;
};

/** Fatty liver (MASLD) risk awareness screening. Educational only. */
export default function FattyLiverScreen() {
  useStatusBarStyle('dark');
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: history, loading: histLoading, error: histError, reload } = useApiQuery(
    () => healthApi.fattyLiverHistory(),
  );

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleEvaluate() {
    setError(null);
    setSaving(true);
    try {
      const payload: any = {};
      const bmiVal = parseFloat(form.bmi);
      if (!isNaN(bmiVal) && bmiVal > 0) payload.bmi = bmiVal;
      const waistVal = parseFloat(form.waist_cm);
      if (!isNaN(waistVal) && waistVal > 0) payload.waist_cm = waistVal;
      if (form.has_diabetes && form.has_diabetes !== 'unknown') payload.has_diabetes = form.has_diabetes === 'yes';
      if (form.has_hypertension && form.has_hypertension !== 'unknown') payload.has_hypertension = form.has_hypertension === 'yes';
      if (form.high_triglycerides && form.high_triglycerides !== 'unknown') payload.high_triglycerides = form.high_triglycerides === 'yes';
      if (form.low_hdl && form.low_hdl !== 'unknown') payload.low_hdl = form.low_hdl === 'yes';
      if (form.alcohol_consumption) payload.alcohol_consumption = form.alcohol_consumption;
      if (form.elevated_alt_ast && form.elevated_alt_ast !== 'unknown') payload.elevated_alt_ast = form.elevated_alt_ast === 'yes';

      const res = await healthApi.fattyLiverEvaluate(payload);
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
      const payload: any = {};
      const bmiVal = parseFloat(form.bmi);
      if (!isNaN(bmiVal) && bmiVal > 0) payload.bmi = bmiVal;
      const waistVal = parseFloat(form.waist_cm);
      if (!isNaN(waistVal) && waistVal > 0) payload.waist_cm = waistVal;
      if (form.has_diabetes && form.has_diabetes !== 'unknown') payload.has_diabetes = form.has_diabetes === 'yes';
      if (form.has_hypertension && form.has_hypertension !== 'unknown') payload.has_hypertension = form.has_hypertension === 'yes';
      if (form.high_triglycerides && form.high_triglycerides !== 'unknown') payload.high_triglycerides = form.high_triglycerides === 'yes';
      if (form.low_hdl && form.low_hdl !== 'unknown') payload.low_hdl = form.low_hdl === 'yes';
      if (form.alcohol_consumption) payload.alcohol_consumption = form.alcohol_consumption;
      if (form.elevated_alt_ast && form.elevated_alt_ast !== 'unknown') payload.elevated_alt_ast = form.elevated_alt_ast === 'yes';

      await healthApi.fattyLiverScreen(payload);
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
        <AppText variant="h1">Liver Health</AppText>
        <AppText color="textMuted" style={styles.intro}>
          Assess known risk factors for metabolic dysfunction-associated steatotic liver disease (MASLD). This is not a diagnosis.
        </AppText>

        <Banner kind="info" message="Fatty liver disease can only be diagnosed by clinical assessment (imaging, blood tests). This tool is for educational awareness only." />

        {error ? <Banner kind="error" message={error} /> : null}

        {result ? (
          <View style={styles.section}>
            <Card style={styles.resultCard}>
              <AppText variant="h2">Risk Awareness Result</AppText>
              <View style={[styles.scoreBadge, { backgroundColor: riskColor(result.risk_level) + '20' }]}>
                <AppText variant="h2" style={{ color: riskColor(result.risk_level) }}>
                  {result.risk_factors_present} / {result.risk_factors_total}
                </AppText>
                <AppText variant="bodyStrong" style={{ color: riskColor(result.risk_level) }}>
                  {result.risk_level}
                </AppText>
              </View>
              <AppText color="textMuted">{result.interpretation}</AppText>

              {result.risk_factors_detail?.length > 0 ? (
                <View style={styles.factors}>
                  <AppText variant="label" color="textSubtle">Risk factors assessed</AppText>
                  {result.risk_factors_detail.map((f: any, i: number) => (
                    <View key={i} style={styles.factorRow}>
                      <AppText variant="bodyStrong" color={f.present ? 'danger' : 'success'}>
                        {f.present ? '⚠' : '✓'}
                      </AppText>
                      <AppText color="textMuted" style={{ flex: 1 }}>{f.factor}: {f.detail}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}

              {result.recommendations?.length > 0 ? (
                <View style={styles.factors}>
                  <AppText variant="label" color="textSubtle">Recommendations</AppText>
                  {result.recommendations.map((r: string, i: number) => (
                    <AppText key={i} color="textMuted">• {r}</AppText>
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
            <SectionHeader title="Your information" />
            <TextField label="BMI (optional)" leftIcon="scale-bathroom" value={form.bmi} onChangeText={set('bmi')} placeholder="25.0" hint="Body Mass Index (kg/m²)" keyboardType="decimal-pad" maxLength={5} />
            <TextField label="Waist circumference (optional)" leftIcon="tape-measure" value={form.waist_cm} onChangeText={set('waist_cm')} placeholder="90" hint="cm" keyboardType="decimal-pad" maxLength={6} />
            <ChipSelect label="Diabetes (type 2)?" options={UNKNOWN_YES_NO} value={form.has_diabetes} onChange={set('has_diabetes')} />
            <ChipSelect label="Hypertension?" options={UNKNOWN_YES_NO} value={form.has_hypertension} onChange={set('has_hypertension')} />
            <ChipSelect label="High triglycerides?" options={UNKNOWN_YES_NO} value={form.high_triglycerides} onChange={set('high_triglycerides')} hint="Based on a recent blood test" />
            <ChipSelect label="Low HDL cholesterol?" options={UNKNOWN_YES_NO} value={form.low_hdl} onChange={set('low_hdl')} hint="Based on a recent blood test" />
            <ChipSelect label="Alcohol consumption?" options={ALCOHOL_OPTIONS} value={form.alcohol_consumption} onChange={set('alcohol_consumption')} />
            <ChipSelect label="Elevated ALT/AST (liver enzymes)?" options={UNKNOWN_YES_NO} value={form.elevated_alt_ast} onChange={set('elevated_alt_ast')} hint="Based on a recent blood test" />

            <Button label="Assess risk factors" icon="clipboard-check-outline" onPress={() => void handleEvaluate()} loading={saving} />
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
                <AppText variant="caption" color="textSubtle">
                  Factors: {item.risk_factors_present}/{item.risk_factors_total}
                </AppText>
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
  factors: { gap: 6 },
  factorRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  disclaimer: { marginTop: 8, fontStyle: 'italic' },
  histCard: { marginTop: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { marginTop: 24 },
});
