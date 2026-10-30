import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { ReminderBootstrap } from '@/components/medicine/ReminderBootstrap';
import { SplashView } from '@/components/SplashView';
import { colors } from '@/theme';

const header = (title: string) => ({
  title,
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.bg },
  headerTitleStyle: { color: colors.text, fontWeight: '700' as const },
  headerBackButtonDisplayMode: 'minimal' as const,
});

/**
 * Protected area. Nothing inside renders unless a user is signed in:
 *  - loading        -> splash (e.g. a deep link arrived before the session was restored)
 *  - error          -> "can't reach server" with retry (session kept, not signed out)
 *  - unauthenticated-> sent to sign-in (also what happens right after "Sign out")
 */
export default function AppLayout() {
  const { state, retry, signOut } = useAuth();

  if (state.status === 'loading') return <SplashView />;
  if (state.status === 'error') return <SplashView errorMessage={state.message} onRetry={() => void retry()} onSignOut={signOut} />;
  if (state.status === 'unauthenticated') return <Redirect href="/login" />;

  return (
    <>
    <ReminderBootstrap />
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="assessment/new" options={header('New assessment')} />
      <Stack.Screen name="assessment/[id]" options={header('Assessment')} />
      <Stack.Screen name="history" options={header('History & trends')} />
      <Stack.Screen name="health-profile" options={header('Health profile')} />
      <Stack.Screen name="medicines/new" options={header('Add medicine')} />
      <Stack.Screen name="medicines/[id]" options={header('Medicine')} />
      <Stack.Screen name="medicines/edit/[id]" options={header('Edit medicine')} />
      <Stack.Screen name="notifications" options={header('Notifications')} />
      <Stack.Screen name="reminders" options={header('Reminders')} />
      <Stack.Screen name="reports" options={header('Weekly Reports')} />
      <Stack.Screen name="diabetes" options={header('Diabetes Risk')} />
      <Stack.Screen name="menstrual" options={header('Cycle Tracking')} />
      <Stack.Screen name="fatty-liver" options={header('Liver Health')} />
      <Stack.Screen name="diet-planner" options={header('Diet & Meal Planner')} />
    </Stack>
    </>
  );
}
