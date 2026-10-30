import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { gradients } from '@/theme';

import { AppText } from './ui/AppText';
import { Banner } from './ui/Banner';
import { Button } from './ui/Button';
import { Logo } from './ui/Logo';

export interface SplashViewProps {
  /** When set, shows the "couldn't reach the server" state instead of the spinner. */
  errorMessage?: string;
  onRetry?: () => void;
  onSignOut?: () => void;
}

/** In-app splash: visually continues the native splash while the session is restored. */
export function SplashView({ errorMessage, onRetry, onSignOut }: SplashViewProps) {
  useStatusBarStyle('light');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Logo size={92} variant="white" />
        <AppText color="onPrimary" style={styles.tagline}>
          Smarter health, every day
        </AppText>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 32 }]}>
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Banner kind="error" message={errorMessage} />
            {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh" /> : null}
            {onSignOut ? (
              <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.link} hitSlop={8}>
                <AppText variant="bodyStrong" color="onPrimary">
                  Sign out of this device
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ActivityIndicator color="#FFFFFF" accessibilityLabel="Loading" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F766E' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  tagline: { opacity: 0.85, letterSpacing: 0.3 },
  bottom: { paddingHorizontal: 24, minHeight: 120, justifyContent: 'flex-end' },
  errorBox: { gap: 4 },
  link: { alignSelf: 'center', paddingVertical: 12 },
});
