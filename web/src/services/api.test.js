import axios, { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getErrorMessage, tokenStore } from './api'

const store = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
})
const dispatched = []
vi.stubGlobal('window', { dispatchEvent: (e) => dispatched.push(e.type) })

function httpError(config, status, data = {}) {
  return new AxiosError('fail', 'ERR', config, {}, { status, data, config, headers: {}, statusText: '' })
}

/** Fake server: `/profile` only accepts the token "new"; everything else succeeds. */
function installAdapter(seen) {
  api.defaults.adapter = async (config) => {
    seen.push(`${config.url}|${config.headers.Authorization ?? ''}`)
    if (config.url === '/profile' && config.headers.Authorization !== 'Bearer new') throw httpError(config, 401)
    if (config.url === '/auth/login') throw httpError(config, 401, { detail: 'Invalid email or password' })
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
  }
}

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
  dispatched.length = 0
  tokenStore.set('old', 'refresh-1')
  vi.restoreAllMocks()
})

describe('token refresh interceptor', () => {
  it('refreshes once on 401 and retries the original request with the new token', async () => {
    const seen = []; installAdapter(seen)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new', refresh_token: 'refresh-2' } })
    const res = await api.get('/profile')
    expect(res.data.ok).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
    expect(tokenStore.access).toBe('new')
    expect(tokenStore.refresh).toBe('refresh-2')
    expect(seen).toEqual(['/profile|Bearer old', '/profile|Bearer new'])
  })

  it('shares a single refresh between concurrent 401s', async () => {
    installAdapter([])
    const post = vi.spyOn(axios, 'post').mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ data: { access_token: 'new', refresh_token: 'refresh-2' } }), 20)))
    const results = await Promise.all([api.get('/profile'), api.get('/profile'), api.get('/profile')])
    expect(results.every((r) => r.data.ok)).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('clears tokens and signals session expiry when the refresh fails', async () => {
    installAdapter([])
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh rejected'))
    await expect(api.get('/profile')).rejects.toBeTruthy()
    expect(tokenStore.access).toBeNull()
    expect(tokenStore.refresh).toBeNull()
    expect(dispatched).toContain('hp:session-expired')
  })

  it('does not attempt a refresh for a failed login', async () => {
    installAdapter([])
    const post = vi.spyOn(axios, 'post')
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('getErrorMessage', () => {
  it('handles network failures, rate limits, server errors and API details', () => {
    expect(getErrorMessage({})).toMatch(/can't reach the server/i)
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/too long/i)
    expect(getErrorMessage({ response: { status: 429, data: {} } })).toMatch(/too many attempts/i)
    expect(getErrorMessage({ response: { status: 500, data: { detail: 'Traceback (most recent call last)...' } } }))
      .not.toMatch(/traceback/i)  // never leak server internals
    expect(getErrorMessage({ response: { status: 409, data: { detail: 'An account with this email already exists' } } }))
      .toBe('An account with this email already exists')
  })
})
