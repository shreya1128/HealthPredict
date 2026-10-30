import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { reportsApi } from '@/api/reports';
import type { WeeklyReport, WeeklyReportSummary } from '@/api/types';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors, radius } from '@/theme';
import { bytesToBase64 } from '@/utils/base64';

async function loadReports(): Promise<{ current: WeeklyReport; history: WeeklyReportSummary[]; historyError: string | null }> {
  // The current-week endpoint creates/updates the stored report. Load history after it so this
  // week's row is reliably present on the first visit as well. A history failure should not hide
  // the successfully loaded current report.
  const current = await reportsApi.weekly();
  try {
    const history = await reportsApi.history();
    return { current, history, historyError: null };
  } catch (error) {
    return {
      current,
      history: [],
      historyError: error instanceof Error ? error.message : 'Report history could not be loaded.',
    };
  }
}

export default function ReportsScreen() {
  useStatusBarStyle('dark');
  const { data, loading, error, reload } = useApiQuery(loadReports);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function downloadAndShare(knownId: number | null, weekStart: string) {
    setDownloadingId(knownId ?? CURRENT_REPORT_BUSY_ID);
    setActionError(null);
    let temporaryUri: string | null = null;
    try {
      // The weekly report response has no id of its own; its stored row id comes from the history list. If the
      // history failed to load earlier, look it up now instead of requesting a nonexistent report.
      const reportId = knownId ?? findReportId(await reportsApi.history(), weekStart);
      if (reportId === null) throw new Error("This week's report has not been saved yet. Refresh and try again.");
      const buffer = await reportsApi.pdf(reportId);
      const base64 = bytesToBase64(buffer);
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error('The device cache directory is not available.');
      const uri = `${directory}healthpredict-report-${weekStart}.pdf`;
      temporaryUri = uri;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'This device cannot share the report PDF. The temporary copy will be removed.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share HealthPredict weekly report', UTI: 'com.adobe.pdf' });
    } catch (e) {
      if (e instanceof ApiError) setActionError(e.message);
      else setActionError(e instanceof Error ? e.message : 'The report PDF could not be downloaded or shared.');
    } finally {
      // Reports contain personal health information. They are temporary cache files, so remove
      // them after the share sheet closes (or after any failure) rather than retaining copies.
      if (temporaryUri) {
        try {
          await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
        } catch {
          setActionError((previous) => previous ?? 'The temporary PDF could not be removed from the app cache.');
        }
      }
      setDownloadingId(null);
    }
  }

  if (loading) return <ScrollView style={styles.root} contentContainerStyle={styles.content}><LoadingView label="Loading weekly report…" /></ScrollView>;
  if (error && !data) return <View style={styles.root}><ErrorState error={error} onRetry={() => void reload()} /></View>;
  if (!data) return null;

  const current = data.current;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <AppText variant="h1">Weekly reports</AppText>
      <AppText color="textMuted" style={styles.intro}>A summary of records saved in HealthPredict. Missing values mean there was no recorded data for that metric during the report period.</AppText>
      {actionError ? <Banner kind="error" message={actionError} /> : null}
      {error ? <Banner kind="warning" message="Some report data may be out of date. Refresh to retry." /> : null}
      {data.historyError ? <Banner kind="warning" message={`Report history could not be loaded: ${data.historyError}`} /> : null}

      <SectionHeader title="This week" />
      <Card style={styles.reportCard}>
        <View style={styles.reportTitleRow}>
          <View style={styles.reportIcon}><MaterialCommunityIcons name="file-chart-outline" size={25} color={colors.primary} /></View>
          <View style={styles.flex}>
            <AppText variant="h2">{current.week_start_date} – {current.week_end_date}</AppText>
            <AppText variant="caption" color="textSubtle">Monday to Sunday</AppText>
          </View>
        </View>
        <Metric label="Average health score" value={format(current.average_health_score, '/100')} />
        <Metric label="Weight change" value={format(current.weight_change_kg, ' kg')} />
        <Metric label="Total exercise" value={format(current.total_exercise_minutes, ' min', 0)} />
        <Metric label="Average sleep" value={format(current.average_sleep_duration, ' h')} />
        <Metric label="Average daily hydration" value={format(current.average_hydration_ml, ' ml')} />
        <Metric label="Medicine adherence" value={format(current.medicine_adherence_percent, '%')} />
        <Metric label="Active goals progress" value={format(current.goals_progress_percent, '%')} />
        <Button label="Download and share PDF" icon="file-pdf-box" onPress={() => void downloadAndShare(findReportId(data.history, current.week_start_date), current.week_start_date)} loading={downloadingId === (findReportId(data.history, current.week_start_date) ?? CURRENT_REPORT_BUSY_ID)} style={styles.pdfButton} />
      </Card>

      {current.significant_changes.length ? <>
        <SectionHeader title="Notable changes" />
        <Card style={styles.listCard}>
          {current.significant_changes.map((item, index) => <View key={`${item.metric}-${index}`} style={styles.textRow}>
            <MaterialCommunityIcons name="trending-up" size={19} color={colors.primary} />
            <AppText style={styles.flex}>{item.message}</AppText>
          </View>)}
        </Card>
      </> : null}

      {current.recommendations.length ? <>
        <SectionHeader title="Suggestions" />
        <Card style={styles.listCard}>
          {current.recommendations.map((item, index) => <View key={`${index}-${item}`} style={styles.textRow}>
            <MaterialCommunityIcons name="information-outline" size={19} color={colors.primary} />
            <AppText style={styles.flex}>{item}</AppText>
          </View>)}
        </Card>
      </> : null}

      <SectionHeader title="Report history" />
      {data.history.length ? data.history.map((report) => <Card key={report.id} style={styles.historyCard}>
        <View style={styles.historyRow}>
          <View style={styles.historyIcon}><MaterialCommunityIcons name="file-document-outline" size={22} color={colors.primary} /></View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Week of {report.week_start_date}</AppText>
            <AppText variant="caption" color="textSubtle">Through {report.week_end_date}</AppText>
            <AppText variant="caption" color="textMuted">{report.average_health_score != null ? `Health score ${report.average_health_score}/100` : 'No health score recorded'}{report.medicine_adherence_percent != null ? ` · Adherence ${report.medicine_adherence_percent}%` : ''}</AppText>
          </View>
          <Button label="PDF" icon="share-variant" variant="secondary" loading={downloadingId === report.id} disabled={downloadingId !== null && downloadingId !== report.id} onPress={() => void downloadAndShare(report.id, report.week_start_date)} />
        </View>
      </Card>) : data.historyError ? <EmptyState icon="file-document-outline" title="History unavailable" message="The current report is available above. Refresh to retry loading saved reports." /> : <EmptyState icon="file-document-outline" title="No saved reports" message="Open this page while signed in to create the current week's report. Past reports appear here after they have been generated." />}

      <View style={styles.refresh}><Button label="Refresh reports" icon="refresh" variant="secondary" onPress={() => void reload()} loading={downloadingId !== null} /></View>
      <AppText variant="caption" color="textSubtle" style={styles.disclaimer}>Educational summary only; not a diagnosis or medical advice. The PDF is generated by the authenticated HealthPredict backend and shared using your device&apos;s native share sheet.</AppText>
    </ScrollView>
  );
}

/** Sentinel for "downloading the current week's report" while its id is still being looked up. */
const CURRENT_REPORT_BUSY_ID = -1;

function findReportId(history: WeeklyReportSummary[], weekStart: string): number | null {
  return history.find((row) => row.week_start_date === weekStart)?.id ?? null;
}
function format(value: number | null, suffix = '', digits = 1): string {
  return value == null ? 'No data' : `${Number(value.toFixed(digits))}${suffix}`;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><AppText color="textMuted">{label}</AppText><AppText variant="bodyStrong" style={styles.metricValue}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 40 },
  intro: { marginTop: 6, marginBottom: 16, lineHeight: 21 },
  reportCard: { gap: 7 },
  reportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  reportIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  metricValue: { maxWidth: '48%', textAlign: 'right' },
  pdfButton: { marginTop: 12 },
  listCard: { gap: 12 },
  textRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyCard: { marginBottom: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  refresh: { marginTop: 14 },
  disclaimer: { marginTop: 18, lineHeight: 18, textAlign: 'center' },
});
