import { isAxiosError } from 'axios';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rate_limit'
  | 'server'
  | 'unknown';

/** Thrown internally when the refresh token is rejected; surfaces to callers as an `unauthorized` ApiError. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** Per-field messages from the backend's 422 `errors` list. Key "" = not tied to one field. */
  readonly fieldErrors: Record<string, string>;

  constructor(kind: ApiErrorKind, message: string, status?: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True for failures where the device simply couldn't talk to the server (not a rejected request). */
  get isConnectivity(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }
}

interface BackendErrorBody {
  detail?: unknown;
  errors?: { field?: string; message?: string }[];
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === 'string') return first.msg;
  }
  return null;
}

/** Turns anything thrown by an API call into an error that is safe and useful to show a person. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof SessionExpiredError) return new ApiError('unauthorized', error.message, 401);

  if (isAxiosError(error)) {
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new ApiError('timeout', 'The request took too long. Please try again.');
      }
      return new ApiError('network', "Can't reach the server. Check your connection and the server address, then try again.");
    }

    const { status } = error.response;
    const data = (error.response.data ?? {}) as BackendErrorBody;
    const detail = detailMessage(data.detail);

    if (status === 429) return new ApiError('rate_limit', 'Too many attempts. Please wait a moment and try again.', status);
    if (status >= 500) return new ApiError('server', 'Something went wrong on our side. Please try again shortly.', status);
    if (status === 401) return new ApiError('unauthorized', detail ?? 'Please sign in to continue.', status);
    if (status === 403) return new ApiError('forbidden', detail ?? "You don't have permission to do that.", status);
    if (status === 404) return new ApiError('not_found', detail ?? 'We could not find what you were looking for.', status);

    if (status === 422 || status === 400) {
      const fieldErrors: Record<string, string> = {};
      for (const e of data.errors ?? []) {
        if (typeof e?.message === 'string') fieldErrors[e.field ?? ''] ??= e.message;
      }
      return new ApiError('validation', detail ?? 'Please check your details and try again.', status, fieldErrors);
    }

    return new ApiError('unknown', detail ?? 'Something went wrong. Please try again.', status);
  }

  return new ApiError('unknown', 'Something went wrong. Please try again.');
}
