import { AxiosError } from 'axios';

import { ApiError, SessionExpiredError, toApiError } from '@/api/errors';

const axiosErr = (status?: number, data?: unknown, code?: string) => {
  const response = status ? ({ status, data, statusText: '', headers: {}, config: {} } as never) : undefined;
  return new AxiosError('x', code, undefined, undefined, response);
};

describe('toApiError', () => {
  it('maps connectivity failures', () => {
    expect(toApiError(axiosErr(undefined, undefined, 'ERR_NETWORK')).kind).toBe('network');
    expect(toApiError(axiosErr(undefined, undefined, 'ECONNABORTED')).kind).toBe('timeout');
    expect(toApiError(axiosErr(503)).isConnectivity).toBe(true);
  });
  it('uses the backend detail message for 401', () => {
    const e = toApiError(axiosErr(401, { detail: 'Invalid email or password' }));
    expect(e.kind).toBe('unauthorized');
    expect(e.message).toBe('Invalid email or password');
  });
  it('maps 422 field errors', () => {
    const e = toApiError(axiosErr(422, { detail: 'Validation failed', errors: [{ field: 'email', message: 'bad email' }, { field: '', message: 'Passwords do not match' }] }));
    expect(e.kind).toBe('validation');
    expect(e.fieldErrors).toEqual({ email: 'bad email', '': 'Passwords do not match' });
  });
  it('reads FastAPI default array-style detail', () => {
    expect(toApiError(axiosErr(422, { detail: [{ msg: 'field required' }] })).message).toBe('field required');
  });
  it('hides server internals for 5xx and rate limits', () => {
    expect(toApiError(axiosErr(500, { detail: 'Traceback ...' })).message).not.toMatch(/Traceback/);
    expect(toApiError(axiosErr(429)).kind).toBe('rate_limit');
  });
  it('is idempotent and handles SessionExpiredError / unknown values', () => {
    const e = new ApiError('forbidden', 'no');
    expect(toApiError(e)).toBe(e);
    expect(toApiError(new SessionExpiredError()).kind).toBe('unauthorized');
    expect(toApiError('weird').kind).toBe('unknown');
  });
});
