import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'
import { tokenStore } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session on first load using HttpOnly cookies.
  useEffect(() => {
    let cancelled = false
    authService.me()
      .then((u) => { if (!cancelled) setUser(u) })
      .catch(() => tokenStore.clear())
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // api.js fires this when a refresh fails (session truly expired).
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('hp:session-expired', onExpired)
    return () => window.removeEventListener('hp:session-expired', onExpired)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authService.login(email, password)
    if (res?.totp_required) {
      return res
    }
    const u = res?.user || res
    setUser(u)
    return u
  }, [])

  const loginTotp = useCallback(async (tempToken, code) => {
    const u = await authService.loginTotp(tempToken, code)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), isAdmin: user?.role === 'ADMIN', login, loginTotp, logout }),
    [user, loading, login, loginTotp, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
