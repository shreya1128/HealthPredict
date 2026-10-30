import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { healthApi } from '@/api/health';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { formatDate, riskPalette } from '@/utils/health';

/** Health hub: latest result at a glance, and the way into assessment, history/trends and the health profile. */
export default function HealthScreen() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const { data, error, loading, refreshing, reload } = useApiQuery(() => healthApi.latest());

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}
      >
        <AppText variant="h1">Health</AppText>

        {loading ? <LoadingView /> : null}
        {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}

        {!loading && !error && data === null ? (
          <EmptyState
            icon="heart-pulse"
            title="No assessment yet"
            message="Enter a few readings to get your health score and an AI heart-risk estimate, with clear reasons."
            actionLabel="Start your first assessment"
            onAction={() => router.push('/assessment/new')}
          />
        ) : null}

        {data ? (
          <View style={styles.section}>
            <Card style={styles.latest}>
              <ScoreGauge score={data.health_score} color={riskPalette(data.risk_category).fg} size={112} />
              <View style={styles.latestText}>
                <AppText variant="caption" color="textSubtle">
                  Latest · {formatDate(data.assessment_date)}
                </AppText>
                <RiskBadge category={data.risk_category} />
                {data.ml_prediction ? (
                  <AppText variant="caption" color="textMuted">
                    AI estimate: {riskPalette(data.ml_prediction.risk_level).label.toLowerCase()} ({Math.round(data.ml_prediction.probability * 100)}%)
                  </AppText>
                ) : data.ml_prediction_missing_fields.length > 0 ? (
                  <AppText variant="caption" color="warning">
                    AI estimate needs {data.ml_prediction_missing_fields.length} more detail{data.ml_prediction_missing_fields.length > 1 ? 's' : ''}
                  </AppText>
                ) : null}
              </View>
            </Card>
            <Button label="View full results" variant="secondary" onPress={() => router.push({ pathname: '/assessment/[id]', params: { id: String(data.id) } })} />
          </View>
        ) : null}

        <SectionHeader title="Actions" />
        <Card>
          <ListRow icon="clipboard-plus-outline" title="New assessment" subtitle="Record today's readings" onPress={() => router.push('/assessment/new')} />
          <Divider />
          <ListRow icon="chart-line" title="History & trends" subtitle="Charts and past assessments" tint="blue" onPress={() => router.push('/history')} />
          <Divider />
          <ListRow icon="account-edit-outline" title="Health profile" subtitle="Height, weight, lifestyle" tint="green" onPress={() => router.push('/health-profile')} />
          <Divider />
          <ListRow icon="diabetes" title="Diabetes risk" subtitle="FINDRISC screening" tint="blue" onPress={() => router.push('/diabetes')} />
          <Divider />
          <ListRow icon="heart-pulse" title="Cycle tracking" subtitle="Period logs & PCOS support" tint="green" onPress={() => router.push('/menstrual')} />
          <Divider />
          <ListRow icon="shield-alert-outline" title="Liver health" subtitle="Fatty liver awareness" tint="blue" onPress={() => router.push('/fatty-liver')} />
          <Divider />
          <ListRow icon="silverware-fork-knife" title="Diet & Meal Planner" subtitle="7-day balanced plans" tint="green" onPress={() => router.push('/diet-planner')} />
        </Card>

        <View style={styles.footer}>
          <Disclaimer />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 32 },
  section: { marginTop: 16, gap: 12 },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  latestText: { flex: 1, gap: 8 },
  footer: { marginTop: 16 },
});
