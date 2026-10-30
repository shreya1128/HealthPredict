import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// Token storage: Secure in-memory token storage paired with HttpOnly cookies.
// Tokens are never stored in localStorage to protect against XSS token exfiltration.
// Double-submit CSRF token is verified via the X-CSRF-Token header.
let _inMemoryAccessToken = null
let _inMemoryRefreshToken = null

export const tokenStore = {
  get access() { return _inMemoryAccessToken },
  get refresh() { return _inMemoryRefreshToken },
  set(access, refresh) {
    _inMemoryAccessToken = access || null
    _inMemoryRefreshToken = refresh || null
    try {
      localStorage.removeItem('hp_access_token')
      localStorage.removeItem('hp_refresh_token')
    } catch { /* no-op */ }
  },
  clear() {
    _inMemoryAccessToken = null
    _inMemoryRefreshToken = null
    try {
      localStorage.removeItem('hp_access_token')
      localStorage.removeItem('hp_refresh_token')
    } catch { /* no-op */ }
  },
}

let _activeProfileId = null

export const profileStore = {
  get activeId() { return _activeProfileId },
  setActiveId(id) { _activeProfileId = id },
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true,
})

function getCsrfToken() {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^|;\\s*)csrf_token=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (_activeProfileId) {
    config.headers['X-Profile-Id'] = String(_activeProfileId)
  }
  const csrfToken = getCsrfToken()
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

// Single-flight refresh: many requests failing at once trigger only one refresh call.
let refreshPromise = null
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password']

async function refreshTokens() {
  // Plain axios (not `api`) so this call bypasses the interceptors and can't loop.
  const refresh = tokenStore.refresh
  const { data } = await axios.post(
    `${BASE_URL}/auth/refresh`,
    refresh ? { refresh_token: refresh } : {},
    { withCredentials: true }
  )
  if (data.access_token) {
    tokenStore.set(data.access_token, data.refresh_token || refresh || '')
  }
  return data
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const isAuthCall = AUTH_PATHS.some((p) => original?.url?.includes(p))
    if (status === 401 && original && !original._retried && !isAuthCall && tokenStore.refresh) {
      original._retried = true
      try {
        refreshPromise = refreshPromise || refreshTokens().finally(() => { refreshPromise = null })
        await refreshPromise
        original.headers.Authorization = `Bearer ${tokenStore.access}`
        return api(original)
      } catch {
        tokenStore.clear()
        window.dispatchEvent(new Event('hp:session-expired'))
      }
    }
    return Promise.reject(error)
  },
)

/** Turns any axios error into a message that is safe and useful to show a user. */
export function getErrorMessage(error) {
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'The request took too long. Please try again.'
      : "Can't reach the server. Check your connection and try again."
  }
  const { status, data } = error.response
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (status >= 500) return 'Something went wrong on our side. Please try again shortly.'
  if (typeof data?.detail === 'string') return data.detail
  return 'Something went wrong. Please check your details and try again.'
}
