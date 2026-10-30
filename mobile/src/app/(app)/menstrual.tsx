import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

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
import { colors } from '@/theme';

type TabMode = 'log' | 'analytics' | 'pcos';

const FLOW_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const SEVERITY = [
  { value: 'none', label: 'None' },
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

/** Menstrual cycle tracking and PCOS educational support screen. */
export default function MenstrualScreen() {
  useStatusBarStyle('dark');
  const [tab, setTab] = useState<TabMode>('log');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <AppText variant="h1">Cycle Tracking</AppText>
      <AppText color="textMuted" style={styles.intro}>
        Track your menstrual cycle and learn about PCOS risk factors. This is not a diagnostic tool.
      </AppText>

      <View style={styles.tabs}>
        {(['log', 'analytics', 'pcos'] as const).map((t) => (
          <Button
            key={t}
            label={t === 'log' ? 'Log' : t === 'analytics' ? 'Analytics' : 'PCOS'}
            variant={tab === t ? 'primary' : 'secondary'}
            onPress={() => setTab(t)}
            style={styles.tabBtn}
          />
        ))}
      </View>

      {tab === 'log' ? <LogTab /> : null}
      {tab === 'analytics' ? <AnalyticsTab /> : null}
      {tab === 'pcos' ? <PCOSTab /> : null}

      <View style={styles.footer}>
        <Disclaimer />
      </View>
    </ScrollView>
  );
}

// ─── Log Tab ──────────────────────────────────────────
function LogTab() {
  const { data: logs, loading, error, reload } = useApiQuery(() => healthApi.menstrualLogs(20));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flow, setFlow] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd() {
    setFormError(null);
    if (!startDate) {
      setFormError('Start date is required (YYYY-MM-DD).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setFormError('Use YYYY-MM-DD format for start date.');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setFormError('Use YYYY-MM-DD format for end date.');
      return;
    }
    setSaving(true);
    try {
      await healthApi.createMenstrualLog({
        period_start_date: startDate,
        period_end_date: endDate || undefined,
        flow_intensity: flow ? flow.toUpperCase() : undefined,
        notes: notes || undefined,
      });
      Alert.alert('Saved', 'Period log added.');
      setStartDate('');
      setEndDate('');
      setFlow(null);
      setNotes('');
      reload();
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    Alert.alert('Delete', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await healthApi.deleteMenstrualLog(id);
            reload();
          } catch (e) {
            Alert.alert('Error', toApiError(e).message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Add period" />
      {formError ? <Banner kind="error" message={formError} /> : null}
      <TextField label="Start date *" leftIcon="calendar-outline" value={startDate} onChangeText={setStartDate} placeholder="2026-01-15" hint="YYYY-MM-DD" maxLength={10} keyboardType="number-pad" />
      <TextField label="End date (optional)" leftIcon="calendar-outline" value={endDate} onChangeText={setEndDate} placeholder="2026-01-20" hint="YYYY-MM-DD" maxLength={10} keyboardType="number-pad" />
      <ChipSelect label="Flow intensity" options={FLOW_OPTIONS} value={flow} onChange={setFlow} />
      <TextField label="Notes (optional)" leftIcon="note-text-outline" value={notes} onChangeText={setNotes} placeholder="e.g. cramps, mood" multiline />
      <Button label="Save period" icon="content-save-outline" onPress={() => void handleAdd()} loading={saving} />

      <SectionHeader title="Period history" />
      {loading ? <LoadingView /> : null}
      {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}
      {!loading && !error && logs?.length === 0 ? (
        <AppText color="textSubtle">No logs yet. Add your first period above.</AppText>
      ) : null}
      {logs?.map((log: any) => (
        <Card key={log.id} style={styles.logCard}>
          <View style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{log.period_start}{log.period_end ? ` → ${log.period_end}` : ''}</AppText>
              {log.flow_intensity ? <AppText variant="caption" color="textSubtle">Flow: {log.flow_intensity}</AppText> : null}
              {log.cycle_length_days ? <AppText variant="caption" color="textSubtle">Cycle: {log.cycle_length_days} days</AppText> : null}
              {log.notes ? <AppText variant="caption" color="textMuted">{log.notes}</AppText> : null}
            </View>
            <Button label="✕" variant="secondary" onPress={() => handleDelete(log.id)} style={styles.delBtn} />
          </View>
        </Card>
      ))}
    </View>
  );
}

// ─── Analytics Tab ──────────────────────────────────────
function AnalyticsTab() {
  const { data, loading, error, reload } = useApiQuery(() => healthApi.cycleAnalytics());

  if (loading) return <LoadingView />;
  if (error) return <ErrorState error={error} onRetry={() => void reload()} />;
  if (!data) return <AppText color="textSubtle">No analytics data available.</AppText>;

  return (
    <View style={styles.section}>
      <SectionHeader title="Cycle analytics" />
      <Card style={styles.analyticsCard}>
        <Row label="Total cycles recorded" value={String(data.total_cycles ?? 0)} />
        <Row label="Average cycle length" value={data.average_cycle_length ? `${data.average_cycle_length} days` : 'Insufficient data'} />
        <Row label="Regularity" value={data.regularity ?? 'Unknown'} />
        {data.shortest_cycle ? <Row label="Shortest cycle" value={`${data.shortest_cycle} days`} /> : null}
        {data.longest_cycle ? <Row label="Longest cycle" value={`${data.longest_cycle} days`} /> : null}
      </Card>
      {data.regularity === 'IRREGULAR' ? (
        <Banner kind="warning" message="Irregular cycles are common and usually not cause for concern, but consider discussing with a healthcare provider if persistent." />
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.analyticsRow}>
      <AppText color="textMuted">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

// ─── PCOS Tab ──────────────────────────────────────────
function PCOSTab() {
  const [irregularCycles, setIrregularCycles] = useState<string | null>(null);
  const [excessHairGrowth, setExcessHairGrowth] = useState<string | null>(null);
  const [acneSeverity, setAcneSeverity] = useState<string | null>(null);
  const [hairThinning, setHairThinning] = useState<string | null>(null);
  const [weightGainDifficulty, setWeightGainDifficulty] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  async function handleEvaluate() {
    setFormError(null);
    if (!irregularCycles) {
      setFormError('Please answer at least the irregular cycles question.');
      return;
    }
    setSaving(true);
    try {
      const res = await healthApi.pcosEvaluate({
        irregular_cycles: irregularCycles === 'yes',
        excess_hair_growth: excessHairGrowth === 'yes',
        acne_severity: acneSeverity ?? 'none',
        hair_thinning: hairThinning === 'yes',
        weight_gain_difficulty: weightGainDifficulty === 'yes',
      });
      setResult(res);
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      await healthApi.pcosScreen({
        irregular_cycles: irregularCycles === 'yes',
        excess_hair_growth: excessHairGrowth === 'yes',
        acne_severity: acneSeverity ?? 'none',
        hair_thinning: hairThinning === 'yes',
        weight_gain_difficulty: weightGainDifficulty === 'yes',
      });
      Alert.alert('Saved', 'PCOS screening saved.');
      setResult(null);
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Banner kind="info" message="PCOS cannot be diagnosed by a questionnaire alone. This is an educational tool to help you decide whether to consult a doctor." />

      {result ? (
        <View style={styles.section}>
          <Card style={styles.resultCard}>
            <AppText variant="h2">Assessment</AppText>
            <AppText variant="bodyStrong" color={result.risk_level?.toLowerCase().includes('low') ? 'success' : 'warning'}>
              {result.risk_level}
            </AppText>
            <AppText color="textMuted">{result.interpretation}</AppText>
            {result.recommendations?.map((r: string, i: number) => (
              <AppText key={i} color="textMuted">• {r}</AppText>
            ))}
            <AppText variant="caption" color="textSubtle" style={styles.disclaimer}>
              {result.disclaimer}
            </AppText>
          </Card>
          <Button label="Save screening" icon="content-save-outline" onPress={() => void handleSave()} loading={saving} />
          <Button label="Start over" variant="secondary" onPress={() => setResult(null)} />
        </View>
      ) : (
        <View style={styles.section}>
          {formError ? <Banner kind="error" message={formError} /> : null}
          <SectionHeader title="Symptom questionnaire" />
          <ChipSelect label="Irregular menstrual cycles? *" options={YES_NO} value={irregularCycles} onChange={setIrregularCycles} hint="Cycles shorter than 21 or longer than 35 days" />
          <ChipSelect label="Excess facial/body hair growth?" options={YES_NO} value={excessHairGrowth} onChange={setExcessHairGrowth} />
          <ChipSelect label="Acne severity?" options={SEVERITY} value={acneSeverity} onChange={setAcneSeverity} />
          <ChipSelect label="Hair thinning or loss?" options={YES_NO} value={hairThinning} onChange={setHairThinning} />
          <ChipSelect label="Unexplained weight gain difficulty?" options={YES_NO} value={weightGainDifficulty} onChange={setWeightGainDifficulty} />
          <Button label="Evaluate" icon="clipboard-check-outline" onPress={() => void handleEvaluate()} loading={saving} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  intro: { marginTop: 4, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabBtn: { flex: 1 },
  section: { gap: 12 },
  logCard: { marginTop: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 36 },
  analyticsCard: { gap: 12 },
  analyticsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  resultCard: { gap: 12 },
  disclaimer: { marginTop: 8, fontStyle: 'italic' },
  footer: { marginTop: 24 },
});
