import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { SplashView } from '@/components/SplashView';
import { useAuth } from '@/auth/AuthContext';
import { hasSeenOnboarding } from '@/storage/flags';

const MIN_SPLASH_MS = 600; // avoids a one-frame flash when the session check is instant

/** Entry route "/": shows the splash while the session is restored, then sends the user where they belong. */
export default function Index() {
  const { state, retry, signOut } = useAuth();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void hasSeenOnboarding().then(setOnboardingSeen);
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (state.status === 'error') {
    return <SplashView errorMessage={state.message} onRetry={() => void retry()} onSignOut={signOut} />;
  }
  if (state.status === 'loading' || onboardingSeen === null || !minElapsed) return <SplashView />;
  if (state.status === 'authenticated') return <Redirect href="/home" />;
  return <Redirect href={onboardingSeen ? '/login' : '/onboarding'} />;
}
