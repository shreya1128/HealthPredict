import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { notificationsApi } from '@/api/notifications';
import type { AppNotification } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { notificationHref, timeAgo, typeLabel } from '@/utils/notificationRoute';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const ICONS: Record<string, Icon> = {
  MISSED_MEDICINE: 'pill', MEDICINE_REMINDER: 'pill', ASSESSMENT_COMPLETED: 'heart-pulse', WEEKLY_REPORT: 'file-chart-outline',
  GOAL_PROGRESS: 'flag-checkered', WELLNESS_REMINDER: 'clipboard-check-outline',
};
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }] as const;
const STEP = 20;
const MAX = 100; // backend page-size limit

export default function NotificationsScreen() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [size, setSize] = useState(STEP);
  const [actionError, setActionError] = useState<string | null>(null);

  // Opening the inbox first asks the server to derive anything that is due from the user's real records.
  const { data, error, loading, refreshing, reload } = useApiQuery(async () => {
    await notificationsApi.refresh().catch(() => null);
    return notificationsApi.list({ pageSize: size, unreadOnly: filter === 'unread' });
  }, `${filter}:${size}`);

  async function open(n: AppNotification) {
    setActionError(null);
    try {
      if (!n.is_read) await notificationsApi.markRead(n.id);
    } catch (e) {
      setActionError(toApiError(e).message);
      return;
    }
    const href = notificationHref(n);
    if (href) router.push(href);
    else await reload();
  }

  async function markAll() {
    setActionError(null);
    try {
      await notificationsApi.markAllRead();
      await reload();
    } catch (e) {
      setActionError(toApiError(e).message);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}
    >
      <View style={styles.head}>
        <AppText color="textMuted" style={styles.flex} accessibilityLiveRegion="polite">
          {data ? `${data.unread} unread` : ' '}
        </AppText>
        <Button label="Mark all as read" icon="check-all" variant="secondary" disabled={!data || data.unread === 0} onPress={() => void markAll()} style={styles.markAll} />
      </View>
      <SegmentedControl label="Show" options={[...FILTERS]} value={filter} onChange={(v) => { setFilter(v); setSize(STEP); }} />
      {actionError ? <Banner kind="error" message={actionError} /> : null}

      {loading ? <LoadingView label="Loading notifications…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="bell-outline"
          title={filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
          message={filter === 'unread' ? 'Nothing unread.' : 'Updates about your health activity will appear here.'}
        />
      ) : null}

      {data?.items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={`${n.is_read ? '' : 'Unread. '}${n.title}. ${n.message ?? ''}`}
          onPress={() => void open(n)}
          style={({ pressed }) => [styles.itemWrap, pressed && { opacity: 0.7 }]}
        >
          <Card style={[styles.item, !n.is_read && styles.unread]}>
            <View style={styles.icon}>
              <MaterialCommunityIcons name={ICONS[n.notification_type] ?? 'bell-outline'} size={22} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {n.title}
                </AppText>
                {!n.is_read ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
              </View>
              {n.message ? <AppText variant="caption" color="textMuted">{n.message}</AppText> : null}
              <AppText variant="caption" color="textSubtle" style={styles.meta}>
                {typeLabel(n.notification_type)} · {timeAgo(n.created_at)}
              </AppText>
            </View>
          </Card>
        </Pressable>
      ))}

      {data && data.items.length < data.total && size < MAX ? (
        <Button label="Load more" variant="secondary" onPress={() => setSize((s) => Math.min(s + STEP, MAX))} style={styles.more} />
      ) : null}

      <AppText variant="caption" color="textSubtle" style={styles.foot}>
        These notifications are created from your own records when you open HealthPredict. They live in the app only: this is not a push
        notification. Reminders at set times are managed under Reminders. Nothing here is medical advice.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  markAll: { minHeight: 44, paddingHorizontal: 14 },
  itemWrap: { marginBottom: 10 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  unread: { borderColor: colors.primaryMid, backgroundColor: colors.primaryTint },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  meta: { marginTop: 4 },
  more: { marginTop: 4 },
  foot: { marginTop: 20 },
});
