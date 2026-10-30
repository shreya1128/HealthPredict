import { api, tokenStore } from './api'

export const authService = {
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    if (data.totp_required) {
      return { totp_required: true, temp_token: data.temp_token }
    }
    tokenStore.set(data.access_token, data.refresh_token)
    return { user: data.user }
  },
  async loginTotp(temp_token, code) {
    const { data } = await api.post('/auth/login/totp', { temp_token, code })
    tokenStore.set(data.access_token, data.refresh_token)
    return data.user
  },
  async register(payload) {
    const { data } = await api.post('/auth/register', payload)
    return data
  },
  async logout() {
    const refresh = tokenStore.refresh
    tokenStore.clear()
    if (refresh) {
      try { await api.post('/auth/logout', { refresh_token: refresh }) } catch { /* already signed out locally */ }
    }
  },
  async me() {
    const { data } = await api.get('/auth/me')
    return data
  },
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, password, confirm_password) =>
    api.post('/auth/reset-password', { token, password, confirm_password }).then((r) => r.data),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }).then((r) => r.data),
  // Group 6: Account Security & Data
  deleteAccount: (password, confirm_phrase = 'DELETE') =>
    api.delete('/auth/account', { data: { password, confirm_phrase } }).then((r) => r.data),
  exportDataJson: () => api.get('/auth/account/export?format=json').then((r) => r.data),
  listSessions: () => api.get('/auth/sessions').then((r) => r.data),
  revokeSession: (sessionId) => api.delete(`/auth/sessions/${sessionId}`).then((r) => r.data),
  revokeAllSessions: () => api.post('/auth/sessions/revoke-all').then((r) => r.data),
  changePassword: (current_password, new_password, confirm_new_password) =>
    api.post('/auth/change-password', { current_password, new_password, confirm_new_password }).then((r) => r.data),
  changeEmail: (new_email, password) =>
    api.post('/auth/change-email', { new_email, password }).then((r) => r.data),
  setupTotp: () => api.post('/auth/totp/setup').then((r) => r.data),
  enableTotp: (secret, code) =>
    api.post('/auth/totp/enable', { secret, password: secret, code }).then((r) => r.data),
  disableTotp: (password, code) =>
    api.post('/auth/totp/disable', { password, code }).then((r) => r.data),
}
