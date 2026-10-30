import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dashboardApi } from '@/api/dashboard';
import { medicinesApi } from '@/api/medicines';
import { notificationsApi } from '@/api/notifications';
import type { Adherence, Dashboard, Goal } from '@/api/types';
import { useAuth, useUser } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { VoiceEntryModal } from '@/components/voice/VoiceEntryModal';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors, gradients, radius } from '@/theme';
import { firstName, greetingFor, initials } from '@/utils/format';
import { formatDate, formatTime, riskPalette } from '@/utils/health';

const goalTitle = (g: Goal) => g.goal_description || g.goal_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function insightIcon(direction: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const d = direction.toLowerCase();
  if (d.includes('up') || d.includes('improv') || d.includes('increas')) return 'trending-up';
  if (d.includes('down') || d.includes('declin') || d.includes('decreas')) return 'trending-down';
  return 'trending-neutral';
}

export default function Home() {
  useStatusBarStyle('light');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { signOut } = useAuth();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { data, error, loading, refreshing, reload } = useApiQuery(async () => {
    // Deriving due notifications and counting unread are best-effort: a failure must never break the dashboard.
    const unread = (async () => {
      await notificationsApi.refresh().catch(() => null);
      return notificationsApi.unreadCount().catch(() => 0);
    })();
    const [dashboard, adherence, unreadCount] = await Promise.all([dashboardApi.get(), medicinesApi.overallAdherence(30).catch(() => null), unread]);
    return { dashboard, adherence, unread: unreadCount };
  });

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need to sign in again to see your health data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.primary} progressViewOffset={insets.top + 8} />}
    >
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 20 }]}>
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <AppText variant="caption" color="onPrimary" style={styles.heroGreeting}>
              {greetingFor()}
            </AppText>
            <AppText variant="display" color="onPrimary" numberOfLines={1} accessibilityRole="header">
              {firstName(user.full_name)}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={data && data.unread > 0 ? `Notifications, ${data.unread} unread` : 'Notifications'}
            onPress={() => router.push('/notifications')}
            style={styles.bell}
          >
            <MaterialCommunityIcons name="bell-outline" size={24} color="#FFFFFF" />
            {data && data.unread > 0 ? (
              <View style={styles.badge}>
                <AppText variant="caption" color="onPrimary" style={styles.badgeText}>{data.unread > 99 ? '99+' : data.unread}</AppText>
              </View>
            ) : null}
          </Pressable>
          <View style={styles.avatar} accessibilityLabel={`Signed in as ${user.full_name}`}>
            <AppText variant="h2" color="onPrimary">
              {initials(user.full_name)}
            </AppText>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={{ marginTop: 16 }}>
          <Button
            label="Quick Health Entry"
            icon="lightning-bolt"
            variant="secondary"
            onPress={() => setVoiceOpen(true)}
          />
        </View>

        {loading ? <View style={styles.pad}><LoadingView label="Loading your dashboard…" /></View> : null}
        {error ? <Card><ErrorState error={error} onRetry={() => void reload()} /></Card> : null}
        {data ? <DashboardSections data={data.dashboard} adherence={data.adherence} /> : null}

        <View style={styles.signOut}>
          <Button label="Sign out" variant="danger" icon="logout" onPress={confirmSignOut} />
        </View>
        <Disclaimer />
      </View>

      <VoiceEntryModal
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSuccess={() => void reload()}
      />
    </ScrollView>
  );
}

function DashboardSections({ data, adherence }: { data: Dashboard; adherence: Adherence | null }) {
  const router = useRouter();
  const a = data.latest_assessment;
  const { hydration_today: water, exercise_this_week: exercise, sleep_this_week: sleep } = data;

  const weekRows = [
    water.goal_ml !== null || water.total_ml > 0
      ? { key: 'water', icon: 'cup-water' as const, title: 'Water today', value: water.goal_ml ? `${water.total_ml} / ${water.goal_ml} ml` : `${water.total_ml} ml`, progress: water.percent_of_goal }
      : null,
    exercise.total_minutes > 0
      ? { key: 'exercise', icon: 'run-fast' as const, title: 'Exercise, last 7 days', value: `${exercise.total_minutes} min`, progress: null }
      : null,
    sleep.average_duration_hours !== null
      ? { key: 'sleep', icon: 'sleep' as const, title: 'Average sleep, last 7 days', value: `${sleep.average_duration_hours.toFixed(1)} h`, progress: null }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <View>
      <SectionHeader title="Your health" />
      {a ? (
        <View style={styles.gap}>
          <Card style={styles.latest}>
            <ScoreGauge score={a.health_score} color={riskPalette(a.risk_category).fg} size={112} />
            <View style={styles.latestText}>
              <AppText variant="caption" color="textSubtle">
                Health score · {formatDate(a.assessment_date)}
              </AppText>
              <RiskBadge category={a.risk_category} />
              {a.ml_prediction ? (
                <AppText variant="caption" color="textMuted">
                  AI estimate: {riskPalette(a.ml_prediction.risk_level).label.toLowerCase()} ({Math.round(a.ml_prediction.probability * 100)}%)
                </AppText>
              ) : a.ml_prediction_missing_fields.length > 0 ? (
                <AppText variant="caption" color="warning">
                  AI estimate needs more profile details
                </AppText>
              ) : null}
            </View>
          </Card>
          <View style={styles.buttons}>
            <Button label="View results" variant="secondary" style={styles.flex} onPress={() => router.push({ pathname: '/assessment/[id]', params: { id: String(a.id) } })} />
            <Button label="New assessment" icon="plus" style={styles.flex} onPress={() => router.push('/assessment/new')} />
          </View>
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="heart-pulse"
            title="Take your first assessment"
            message="Enter a few readings to see your health score and AI heart-risk estimate here."
            actionLabel="Start assessment"
            onAction={() => router.push('/assessment/new')}
          />
        </Card>
      )}

      {data.insights.length > 0 ? (
        <>
          <SectionHeader title="Insights" />
          <Card>
            {data.insights.map((i, idx) => (
              <View key={`${i.metric}${idx}`}>
                {idx > 0 ? <Divider /> : null}
                <View style={styles.insight}>
                  <MaterialCommunityIcons name={insightIcon(i.direction)} size={22} color={colors.primary} />
                  <AppText style={styles.flex}>{i.message}</AppText>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {data.today_medicines.length > 0 ? (
        <>
          <SectionHeader title="Today's medicines" />
          <Card>
            {adherence && adherence.adherence_percent !== null && adherence.scheduled_count > 0 ? (
              <>
                <ListRow icon="chart-donut" tint="green" title="Adherence, last 30 days" value={`${Math.round(adherence.adherence_percent)}%`} onPress={() => router.navigate('/medicines')} />
                <Divider />
              </>
            ) : null}
            {data.today_medicines.map((m, idx) => (
              <View key={m.id}>
                {idx > 0 ? <Divider /> : null}
                <ListRow
                  icon="pill"
                  tint="blue"
                  title={m.medicine_name ?? 'Medicine'}
                  subtitle={formatTime(m.scheduled_time) || undefined}
                  badge={m.is_taken ? 'Taken' : m.is_skipped ? 'Skipped' : 'Pending'}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {weekRows.length > 0 ? (
        <>
          <SectionHeader title="Wellness" />
          <Card>
            {weekRows.map((r, idx) => (
              <View key={r.key}>
                {idx > 0 ? <Divider /> : null}
                <ListRow icon={r.icon} tint="green" title={r.title} value={r.value} />
                {r.progress !== null ? <View style={styles.rowProgress}><ProgressBar value={r.progress} color={colors.accent} label={`${r.title} ${Math.round(r.progress)} percent of goal`} /></View> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {data.active_goals.length > 0 ? (
        <>
          <SectionHeader title="Goals" />
          <Card style={styles.goals}>
            {data.active_goals.slice(0, 3).map((g) => (
              <View key={g.id} style={styles.goal}>
                <View style={styles.goalHead}>
                  <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                    {goalTitle(g)}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {g.percentage_complete !== null ? `${Math.round(g.percentage_complete)}%` : 'No progress yet'}
                  </AppText>
                </View>
                <ProgressBar value={g.percentage_complete ?? 0} label={`${goalTitle(g)} progress`} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 32 },
  hero: { paddingHorizontal: 20, paddingBottom: 40, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroText: { flex: 1 },
  heroGreeting: { opacity: 0.85, marginBottom: 2 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20 },
  pad: { paddingTop: 24 },
  gap: { gap: 12 },
  flex: { flex: 1 },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  latestText: { flex: 1, gap: 8 },
  buttons: { flexDirection: 'row', gap: 12 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowProgress: { marginLeft: 54, marginBottom: 8 },
  goals: { gap: 16 },
  goal: { gap: 8 },
  goalHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  signOut: { marginTop: 28, marginBottom: 8 },
});
