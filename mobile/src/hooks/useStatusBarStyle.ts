import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

/**
 * Sets the status-bar icon colour while a screen is focused. Stack screens stay mounted underneath each other,
 * so a plain <StatusBar/> in each screen would leave the wrong style after navigating back.
 */
export function useStatusBarStyle(style: 'light' | 'dark') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
    }, [style]),
  );
}
