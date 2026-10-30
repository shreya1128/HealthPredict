import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { profileApi } from '@/api/profile';
import { toApiError } from '@/api/errors';
import { useAuth, useUser } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { env } from '@/config/env';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { genderLabel, initials, roleLabel } from '@/utils/format';

const SOURCE_LABEL = {
  env: 'from EXPO_PUBLIC_API_BASE_URL',
  'dev-server-host': "auto-detected from the Expo dev server's address",
  'platform-default': 'emulator default (set EXPO_PUBLIC_API_BASE_URL for a physical phone)',
} as const;

export default function Profile() {
  useStatusBarStyle('dark');
  const user = useUser();
  const router = useRouter();
  const { signOut, refreshUser } = useAuth();

  let detectedTz = 'UTC';
  try {
    detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    detectedTz = 'UTC';
  }

  function handleTimezonePress() {
    const currentTz = user.timezone || 'UTC';
    if (detectedTz !== currentTz) {
      Alert.alert(
        'Update Timezone',
        `Current timezone: ${currentTz}\nDetected device timezone: ${detectedTz}\n\nWould you like to switch to ${detectedTz}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Use ${detectedTz}`,
            onPress: async () => {
              try {
                await profileApi.update({ timezone: detectedTz });
                await refreshUser();
                Alert.alert('Timezone updated', `Timezone set to ${detectedTz}`);
              } catch (e) {
                Alert.alert('Failed to update timezone', toApiError(e).message);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert('Timezone', `Your saved timezone is ${currentTz}, which matches your device.`);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need to sign in again to see your health data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <AppText variant="display" color="primary">
            {initials(user.full_name)}
          </AppText>
        </View>
        <AppText variant="h1" center accessibilityRole="header">
          {user.full_name}
        </AppText>
        <AppText color="textMuted" center>
          {user.email}
        </AppText>
      </View>

      <Card style={styles.menu}>
        <ListRow icon="heart-cog-outline" title="Health profile" subtitle="Height, weight, lifestyle" onPress={() => router.push('/health-profile')} />
        <Divider />
        <ListRow icon="bell-outline" title="Notifications" subtitle="Your in-app inbox" tint="blue" onPress={() => router.push('/notifications')} />
        <Divider />
        <ListRow icon="alarm" title="Reminders" subtitle="Hydration and bedtime" tint="green" onPress={() => router.push('/reminders')} />
        <Divider />
        <ListRow icon="file-chart-outline" title="Weekly reports" subtitle="Review summaries and share PDF reports" onPress={() => router.push('/reports')} />
      </Card>

      <Card>
        <ListRow icon="shield-account-outline" title="Account type" value={roleLabel(user.role)} tint="accent" />
        <Divider />
        <ListRow icon="email-check-outline" title="Email" value={user.email_verified ? 'Verified' : 'Not verified'} />
        {user.phone ? (
          <>
            <Divider />
            <ListRow icon="phone-outline" title="Phone" value={user.phone} tint="blue" />
          </>
        ) : null}
        {user.gender ? (
          <>
            <Divider />
            <ListRow icon="human" title="Gender" value={genderLabel(user.gender)} tint="green" />
          </>
        ) : null}
        {user.date_of_birth ? (
          <>
            <Divider />
            <ListRow icon="calendar-outline" title="Date of birth" value={user.date_of_birth} tint="blue" />
          </>
        ) : null}
        <Divider />
        <ListRow
          icon="clock-outline"
          title="Timezone"
          value={user.timezone || 'UTC'}
          subtitle={detectedTz !== (user.timezone || 'UTC') ? `Device is ${detectedTz} · Tap to update` : 'Used for reminder schedule'}
          tint="accent"
          onPress={handleTimezonePress}
        />
      </Card>

      {__DEV__ ? (
        <Card style={styles.devCard}>
          <AppText variant="overline" color="textSubtle">
            Developer · connection
          </AppText>
          <AppText variant="caption" color="text" selectable style={styles.mono}>
            {env.apiBaseUrl}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            Server address {SOURCE_LABEL[env.apiUrlSource]}.
          </AppText>
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Sign out" variant="danger" icon="logout" onPress={confirmSignOut} />
      </View>
      <AppText variant="caption" color="textSubtle" center style={styles.version}>
        HealthPredict v{env.appVersion}
      </AppText>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4, marginBottom: 24, marginTop: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  menu: { marginBottom: 16 },
  devCard: { marginTop: 16, gap: 4 },
  mono: { fontFamily: 'monospace' },
  actions: { marginTop: 24 },
  version: { marginTop: 16 },
});
