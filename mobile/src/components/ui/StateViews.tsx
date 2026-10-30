import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { colors } from '@/theme';

import { AppText } from './AppText';
import { EmptyState } from './EmptyState';

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <AppText variant="caption" color="textSubtle" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

/** Distinguishes "can't reach the server" from "the server said no" so the advice is right. */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <EmptyState
      icon={error.isConnectivity ? 'wifi-off' : 'alert-circle-outline'}
      title={error.isConnectivity ? "Can't connect" : 'Something went wrong'}
      message={error.message}
      actionLabel="Try again"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  label: { marginTop: 12 },
});
