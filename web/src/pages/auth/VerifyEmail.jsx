import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../../services/authService'
import { getErrorMessage } from '../../services/api'
import { Alert } from '../../components/common/Feedback'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function verify() {
      if (!token) {
        setLoading(false)
        setError('This verification link is missing a token. Please check the link in your email.')
        return
      }

      try {
        await authService.verifyEmail(token)
        if (!cancelled) {
          setSuccess(true)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err) || 'This email verification link is invalid or has expired.')
          setLoading(false)
        }
      }
    }

    verify()

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-2xl font-display font-bold text-slate-900">Email Verification</h1>

      {loading && (
        <div className="py-8 space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-teal-600 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="text-slate-600">Verifying your email address…</p>
        </div>
      )}

      {!loading && success && (
        <div className="space-y-4">
          <div className="rounded-xl bg-teal-50 p-4 border border-teal-200 text-teal-800">
            <p className="font-semibold text-lg">Your email has been verified!</p>
            <p className="text-sm mt-1">Your account is fully activated. You can now sign in and access all features.</p>
          </div>
          <Link
            to="/login"
            className="inline-block w-full py-3 px-4 rounded-xl bg-teal-700 text-white font-semibold hover:bg-teal-800 transition"
          >
            Sign in to your account
          </Link>
        </div>
      )}

      {!loading && !success && (
        <div className="space-y-4 text-left">
          <Alert>{error}</Alert>
          <div className="text-center pt-2">
            <Link to="/login" className="font-semibold text-teal-700 hover:underline">
              Return to Sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
