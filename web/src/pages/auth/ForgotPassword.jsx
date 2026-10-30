import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../../services/authService'
import { getErrorMessage } from '../../services/api'
import { isEmail } from '../../utils/validators'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!isEmail(email)) return setError('Enter a valid email address')
    setLoading(true)
    try {
      const res = await authService.forgotPassword(email.trim())
      setSent(res.message)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900">Reset your password</h1>
      <p className="mt-1 text-slate-600">Enter your email and we'll send you a reset link.</p>
      <div className="mt-6 space-y-5">
        {sent ? <Alert kind="success">{sent}</Alert> : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error && <Alert>{error}</Alert>}
            <Field id="email" label="Email">
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputClass(false)} placeholder="you@example.com" />
            </Field>
            <SubmitButton loading={loading} loadingText="Sending…">Send reset link</SubmitButton>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-teal-700 hover:underline">Back to sign in</Link></p>
    </div>
  )
}
