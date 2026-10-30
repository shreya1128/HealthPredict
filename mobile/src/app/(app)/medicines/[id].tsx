import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import { useUser } from '@/auth/AuthContext';
import { AdherenceCard } from '@/components/medicine/AdherenceCard';
import { DoseRow } from '@/components/medicine/DoseRow';
import { StatusPill } from '@/components/medicine/StatusPill';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDoseActions } from '@/hooks/useDoseActions';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { syncMedicineReminders } from '@/notifications/medicineReminders';
import { colors } from '@/theme';
import { formatDate } from '@/utils/health';
import { dosageText, FORM_LABELS, groupByDate, scheduleText } from '@/utils/medicineDisplay';
import { todayIso } from '@/utils/medicineForm';

function AdherenceSection({ medicineId, version }: { medicineId: number; version: number }) {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const { data, error, loading, reload } = useApiQuery(() => medicinesApi.adherence(medicineId, Number(range)), `${range}:${version}`);
  return (
    <>
      <SectionHeader title="Adherence" />
      <SegmentedControl label="Period" options={[...RANGES]} value={range} onChange={setRange} />
      {loading ? <LoadingView /> : null}
      {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}
      {data ? <AdherenceCard adherence={data} title={`This medicine · last ${range} days`} /> : null}
    </>
  );
}

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

export default function MedicineDetail() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const userId = useUser().id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicineId = Number(id);

  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const main = useApiQuery(async () => {
    const [medicine, schedule] = await Promise.all([medicinesApi.get(medicineId), medicinesApi.schedule(medicineId, 7, 14)]);
    return { medicine, schedule };
  });
  // The adherence section reloads itself when this counter changes (after a dose is logged or a medicine is paused).
  const [adherenceVersion, setAdherenceVersion] = useState(0);

  const reloadMain = main.reload;
  const reloadAll = useCallback(async () => {
    setAdherenceVersion((v) => v + 1);
    await reloadMain();
  }, [reloadMain]);
  const { act, busyId, error: doseError } = useDoseActions(userId, reloadAll);

  async function setActive(active: boolean) {
    setWorking(true);
    setActionError(null);
    try {
      await medicinesApi.update(medicineId, { is_active: active });
      await reloadAll();
      void syncMedicineReminders(userId).catch(() => undefined);
    } catch (e) {
      setActionError(toApiError(e).message);
    } finally {
      setWorking(false);
    }
  }

  function confirmDelete(name: string) {
    Alert.alert(`Delete ${name}?`, 'This also removes its schedule and dose history, which will change your adherence numbers. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setWorking(true);
            try {
              await medicinesApi.remove(medicineId);
              void syncMedicineReminders(userId).catch(() => undefined);
              router.replace('/medicines');
            } catch (e) {
              setActionError(toApiError(e).message);
              setWorking(false);
            }
          })();
        },
      },
    ]);
  }

  if (main.loading) return <LoadingView label="Loading medicine…" />;
  if (main.error) return <ErrorState error={main.error} onRetry={() => void main.reload()} />;
  if (!main.data) return null;

  const { medicine: m, schedule } = main.data;
  const today = todayIso();
  const groups = groupByDate(schedule);
  const details = [
    m.reason_for_use ? { icon: 'stethoscope' as const, title: 'For', value: m.reason_for_use } : null,
    { icon: 'calendar-start' as const, title: 'Started', value: formatDate(m.start_date) },
    m.end_date ? { icon: 'calendar-end' as const, title: 'Ends', value: formatDate(m.end_date) } : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={main.refreshing} onRefresh={() => void reloadAll()} tintColor={colors.primary} />}
    >
      {actionError || doseError ? <Banner kind="error" message={(actionError ?? doseError) as string} /> : null}

      <Card style={styles.head}>
        <View style={styles.headRow}>
          <AppText variant="h1" style={styles.flex} accessibilityRole="header">
            {m.medicine_name}
          </AppText>
          <StatusPill status={m.is_active ? 'active' : 'paused'} />
        </View>
        <AppText color="textMuted">{[dosageText(m), FORM_LABELS[m.form]].filter(Boolean).join(' · ')}</AppText>
        <AppText variant="bodyStrong">{scheduleText(m)}</AppText>
        {m.instructions ? <AppText color="textMuted">{m.instructions}</AppText> : null}
        {m.notes ? <AppText variant="caption" color="textSubtle">{m.notes}</AppText> : null}
        <View style={styles.buttons}>
          <Button label="Edit" icon="pencil-outline" variant="secondary" style={styles.flex} onPress={() => router.push({ pathname: '/medicines/edit/[id]', params: { id: String(m.id) } })} />
          <Button label={m.is_active ? 'Pause' : 'Resume'} icon={m.is_active ? 'pause' : 'play'} variant="secondary" style={styles.flex} loading={working} onPress={() => void setActive(!m.is_active)} />
        </View>
      </Card>

      {!m.is_active ? (
        <View style={styles.banner}>
          <Banner kind="warning" message="Paused: this medicine is left out of today's doses and your overall adherence, and gets no reminders. Resume it to pick up where you left off." />
        </View>
      ) : null}
      {m.frequency_unit === 'AS_NEEDED' ? (
        <View style={styles.banner}>
          <Banner kind="info" message="As-needed medicines have no scheduled doses, so there are no reminders or adherence figures for this one." />
        </View>
      ) : null}

      <Card style={styles.details}>
        {details.map((r, i) => (
          <View key={r.title}>
            {i > 0 ? <Divider /> : null}
            <ListRow icon={r.icon} title={r.title} value={r.value} />
          </View>
        ))}
      </Card>

      {m.frequency_unit !== 'AS_NEEDED' ? (
        <>
          <AdherenceSection medicineId={medicineId} version={adherenceVersion} />

          <SectionHeader title="Schedule" />
          {groups.length === 0 ? (
            <Card><AppText color="textMuted">No doses are scheduled in the last 7 or next 14 days.</AppText></Card>
          ) : (
            groups.map((g) => (
              <View key={g.date} style={styles.group}>
                <AppText variant="label" color="textMuted" style={styles.groupLabel}>
                  {g.date === today ? 'Today' : formatDate(g.date)}
                </AppText>
                <Card>
                  {g.entries.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 ? <Divider /> : null}
                      <DoseRow entry={e} busy={busyId === e.id} onAct={(entry, kind) => void act(entry, kind)} />
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )}
        </>
      ) : null}

      <View style={styles.delete}>
        <Button label="Delete medicine" icon="trash-can-outline" variant="danger" loading={working} onPress={() => confirmDelete(m.medicine_name)} />
      </View>
      <Disclaimer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  head: { gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  banner: { marginTop: 12 },
  details: { marginTop: 12 },
  group: { marginBottom: 12 },
  groupLabel: { marginBottom: 6, marginLeft: 4 },
  delete: { marginTop: 28, marginBottom: 8 },
});
