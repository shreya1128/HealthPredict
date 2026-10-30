import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/** Goes back if there is a screen to go back to (not the case after a deep link or notification tap), otherwise to `fallback`. */
export function useSafeBack(fallback: Href) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
