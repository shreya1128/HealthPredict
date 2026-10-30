import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { resolveApiUrl } from './apiUrl';

// Each EXPO_PUBLIC_* variable must be referenced literally so Expo can inline it at bundle time.
const resolved = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  hostUri: Constants.expoConfig?.hostUri,
  platform: Platform.OS,
  isDev: __DEV__,
  port: process.env.EXPO_PUBLIC_API_PORT,
});

const timeout = Number(process.env.EXPO_PUBLIC_API_TIMEOUT);

export const env = {
  apiBaseUrl: resolved.url,
  apiUrlSource: resolved.source,
  apiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
} as const;
