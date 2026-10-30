import { normalizeApiUrl, resolveApiUrl } from '@/config/apiUrl';

describe('normalizeApiUrl', () => {
  it('adds scheme, strips trailing slashes, appends /api when no path given', () => {
    expect(normalizeApiUrl('192.168.1.50:8000')).toBe('http://192.168.1.50:8000/api');
    expect(normalizeApiUrl('http://192.168.1.50:8000/')).toBe('http://192.168.1.50:8000/api');
    expect(normalizeApiUrl('  https://api.example.com/api/  ')).toBe('https://api.example.com/api');
  });
  it('leaves an explicit path alone', () => {
    expect(normalizeApiUrl('https://example.com/health/api/v1')).toBe('https://example.com/health/api/v1');
  });
});

describe('resolveApiUrl', () => {
  const base = { platform: 'android', isDev: true } as const;

  it('explicit env URL always wins', () => {
    const r = resolveApiUrl({ ...base, envUrl: 'http://10.1.2.3:9000/api', hostUri: '192.168.1.5:8081' });
    expect(r).toEqual({ url: 'http://10.1.2.3:9000/api', source: 'env' });
  });
  it('in dev, derives host from the Expo dev server LAN address', () => {
    const r = resolveApiUrl({ ...base, hostUri: '192.168.1.5:8081', port: '8001' });
    expect(r).toEqual({ url: 'http://192.168.1.5:8001/api', source: 'dev-server-host' });
  });
  it('ignores tunnel hostnames, which do not point at your backend', () => {
    const r = resolveApiUrl({ ...base, hostUri: 'abc-123.exp.direct:443' });
    expect(r.source).toBe('platform-default');
  });
  it('does not use the dev server host outside development', () => {
    const r = resolveApiUrl({ platform: 'ios', isDev: false, hostUri: '192.168.1.5:8081' });
    expect(r.source).toBe('platform-default');
  });
  it('falls back to 10.0.2.2 on Android and localhost on iOS', () => {
    expect(resolveApiUrl({ platform: 'android', isDev: false }).url).toBe('http://10.0.2.2:8000/api');
    expect(resolveApiUrl({ platform: 'ios', isDev: false }).url).toBe('http://localhost:8000/api');
  });
  it('treats a blank env value as unset', () => {
    expect(resolveApiUrl({ ...base, envUrl: '   ', hostUri: null }).source).toBe('platform-default');
  });
});
