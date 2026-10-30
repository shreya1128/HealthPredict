import { useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { healthApi } from '@/api/health';
import { AssessmentResult } from '@/components/health/AssessmentResult';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';

export default function AssessmentDetail() {
  useStatusBarStyle('dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, reload } = useApiQuery(() => healthApi.get(Number(id)));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}
    >
      {loading ? <LoadingView label="Loading assessment…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}
      {data ? <AssessmentResult assessment={data} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
});
