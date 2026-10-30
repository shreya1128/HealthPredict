import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { medicinesApi } from '@/api/medicines';
import { useUser } from '@/auth/AuthContext';
import { AdherenceCard } from '@/components/medicine/AdherenceCard';
import { DoseRow } from '@/components/medicine/DoseRow';
import { ReminderCard } from '@/components/medicine/ReminderCard';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDoseActions } from '@/hooks/useDoseActions';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { dosageText, FORM_LABELS, scheduleText } from '@/utils/medicineDisplay';

export default function MedicinesScreen() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const user = useUser();
  const { data, error, loading, refreshing, reload } = useApiQuery(async () => {
    const [medicines, today, overall] = await Promise.all([medicinesApi.list(), medicinesApi.today(), medicinesApi.overallAdherence(30)]);
    return { medicines, today, overall };
  });
  const { act, busyId, error: actionError } = useDoseActions(user.id, reload);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}
      >
        <AppText variant="h1">Medicines</AppText>

        {loading ? <LoadingView label="Loading your medicines…" /> : null}
        {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}

        {data && data.medicines.length === 0 ? (
          <EmptyState
            icon="pill"
            title="No medicines yet"
            message="Add a medicine to see today's doses, get reminders and track how consistently you take it."
            actionLabel="Add your first medicine"
            onAction={() => router.push('/medicines/new')}
          />
        ) : null}

        {data && data.medicines.length > 0 ? (
          <View>
            {actionError ? <View style={styles.banner}><Banner kind="error" message={actionError} /></View> : null}
            <View style={styles.addRow}>
              <Button label="Add medicine" icon="plus" onPress={() => router.push('/medicines/new')} />
            </View>

            <SectionHeader title="Reminders" />
            <ReminderCard userId={user.id} />

            {data.overall.adherence_percent !== null && data.overall.scheduled_count > 0 ? (
              <>
                <SectionHeader title="Adherence" />
                <AdherenceCard adherence={data.overall} title="All medicines · last 30 days" />
              </>
            ) : null}

            <SectionHeader title="Today's doses" />
            <Card>
              {data.today.length === 0 ? (
                <AppText color="textMuted">No doses are scheduled for today.</AppText>
              ) : (
                data.today.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <Divider /> : null}
                    <DoseRow entry={e} showName busy={busyId === e.id} onAct={(entry, kind) => void act(entry, kind)} />
                  </View>
                ))
              )}
            </Card>

            <SectionHeader title="Your medicines" />
            <Card>
              {data.medicines.map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    icon="pill"
                    tint={m.is_active ? 'blue' : 'primary'}
                    title={m.medicine_name}
                    subtitle={[dosageText(m), FORM_LABELS[m.form], scheduleText(m)].filter(Boolean).join(' · ')}
                    badge={m.is_active ? undefined : 'Paused'}
                    onPress={() => router.push({ pathname: '/medicines/[id]', params: { id: String(m.id) } })}
                  />
                </View>
              ))}
            </Card>
            <View style={styles.footer}>
              <Disclaimer />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 32 },
  banner: { marginTop: 12 },
  addRow: { marginTop: 16 },
  footer: { marginTop: 16 },
});
