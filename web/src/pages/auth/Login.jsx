import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../services/api'
import { isEmail } from '../../utils/validators'
import { Alert, Field, PasswordInput, SubmitButton, inputClass } from '../../components/common/Feedback'
import { ArrowLeft, KeyRound, RefreshCw, Shield, Zap } from 'lucide-react'

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'demo@healthpredict.local'
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'Demo@123456'
const ENABLE_DEMO = import.meta.env.VITE_ENABLE_DEMO === 'true' || import.meta.env.DEV

export default function Login() {
  const { login, loginTotp, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [totpRequired, setTotpRequired] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function doLogin(email, password) {
    setLoading(true)
    setServerError('')
    setIsNetworkError(false)
    try {
      const res = await login(email.trim(), password)
      if (res?.totp_required) {
        setTotpRequired(true)
        setTempToken(res.temp_token)
        return
      }
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      const msg = getErrorMessage(err)
      const noServer = !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED'
      setIsNetworkError(noServer)
      setServerError(
        noServer
          ? "We can't reach the server right now. Please try again in a moment."
          : msg
      )
    } finally {
      setLoading(false)
    }
  }

  async function onTotpSubmit(e) {
    e.preventDefault()
    if (!totpCode || totpCode.trim().length !== 6) {
      setErrors({ totp: 'Enter the 6-digit authentication code' })
      return
    }
    setErrors({})
    setLoading(true)
    setServerError('')
    try {
      await loginTotp(tempToken, totpCode.trim())
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      setServerError(getErrorMessage(err) || 'Invalid authentication code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!isEmail(form.email)) next.email = 'Enter a valid email address'
    if (!form.password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return
    await doLogin(form.email, form.password)
  }

  async function tryDemo(e) {
    e.preventDefault()
    setForm({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    setErrors({})
    await doLogin(DEMO_EMAIL, DEMO_PASSWORD)
  }

  if (totpRequired) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-display font-bold text-slate-900">Two-Factor Authentication</h1>
        </div>
        <p className="mt-1 text-slate-600">
          Enter the 6-digit verification code from your authenticator app (Google Authenticator, Authy, etc.).
        </p>

        <form onSubmit={onTotpSubmit} noValidate className="mt-6 space-y-5">
          {serverError && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border p-3 text-sm bg-red-50 text-red-800 border-red-200">
              <div className="flex-1">{serverError}</div>
            </div>
          )}

          <Field id="totpCode" label="Verification Code" error={errors.totp}>
            <div className="relative">
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(errors.totp)}
                className={`${inputClass(errors.totp)} text-center tracking-widest text-lg font-mono`}
                placeholder="000000"
              />
              <KeyRound className="absolute right-3 top-2.5 h-5 w-5 text-slate-400 pointer-events-none" />
            </div>
          </Field>

          <SubmitButton loading={loading} loadingText="Verifying…">Verify & Sign In</SubmitButton>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setTotpRequired(false)
                setTempToken('')
                setTotpCode('')
                setServerError('')
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> Back to email & password
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900">Welcome back</h1>
      <p className="mt-1 text-slate-600">Sign in to continue to HealthPredict.</p>

      {location.state?.notice && (
        <div className="mt-6"><Alert kind="success">{location.state.notice}</Alert></div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {serverError && (
          <div role="alert" className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
            isNetworkError
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            <div className="flex-1">{serverError}</div>
            {isNetworkError && (
              <button
                type="button"
                onClick={onSubmit}
                className="flex items-center gap-1 font-semibold shrink-0 hover:underline"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            )}
          </div>
        )}

        <Field id="email" label="Email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')}
            aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}
            className={inputClass(errors.email)} placeholder="you@example.com" />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="current-password" value={form.password}
            onChange={set('password')} error={errors.password} />
        </Field>

        <div className="text-right -mt-2">
          <Link to="/forgot-password" className="text-sm font-medium text-teal-700 hover:underline">
            Forgot password?
          </Link>
        </div>

        <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>

        {ENABLE_DEMO && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-slate-50 px-2 text-slate-500">or</span></div>
            </div>

            <button
              type="button"
              onClick={tryDemo}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              Try demo account
            </button>
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New to HealthPredict?{' '}
        <Link to="/register" className="font-semibold text-teal-700 hover:underline">Create an account</Link>
      </p>
    </div>
  )
}
