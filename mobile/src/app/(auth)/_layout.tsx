import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

/** Public screens. A signed-in user is bounced into the app; a still-loading session is handled by "/" . */
export default function AuthLayout() {
  const { state } = useAuth();
  if (state.status === 'authenticated') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.surface } }} />;
}
