/**
 * Pure logic for choosing the backend URL (kept free of Expo imports so it can be unit-tested).
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_BASE_URL  - always wins. Required for a physical phone if auto-detection is wrong.
 *   2. Dev-server host           - in development, the machine running Metro (`expo start`) is usually the
 *                                  same machine running the backend, so its LAN IP is a good guess.
 *   3. Emulator defaults         - Android emulator reaches the host machine at 10.0.2.2; iOS simulator
 *                                  shares the host's network, so localhost works.
 */
export type ApiUrlSource = 'env' | 'dev-server-host' | 'platform-default';

export interface ApiUrlInput {
  envUrl?: string | null;
  /** e.g. "192.168.1.20:8081" (Expo's `hostUri`). Absent in production builds. */
  hostUri?: string | null;
  platform: string;
  isDev: boolean;
  port?: string | null;
}

export interface ApiUrlResult {
  url: string;
  source: ApiUrlSource;
}

const DEFAULT_PORT = '8000';
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Trims, adds a missing scheme, strips trailing slashes, and adds `/api` when no path was given. */
export function normalizeApiUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  if (/^https?:\/\/[^/]+$/i.test(url)) url = `${url}/api`;
  return url;
}

function hostFromHostUri(hostUri?: string | null): string | null {
  if (!hostUri) return null;
  const host = hostUri.split('/')[0].split(':')[0];
  // Tunnel hostnames (exp.direct etc.) point at Expo's relay, not at your backend.
  return IPV4.test(host) || host === 'localhost' ? host : null;
}

export function resolveApiUrl(input: ApiUrlInput): ApiUrlResult {
  const port = (input.port || DEFAULT_PORT).trim();

  if (input.envUrl && input.envUrl.trim()) {
    return { url: normalizeApiUrl(input.envUrl), source: 'env' };
  }

  if (input.isDev) {
    const host = hostFromHostUri(input.hostUri);
    if (host) return { url: `http://${host}:${port}/api`, source: 'dev-server-host' };
  }

  const host = input.platform === 'android' ? '10.0.2.2' : 'localhost';
  return { url: `http://${host}:${port}/api`, source: 'platform-default' };
}
