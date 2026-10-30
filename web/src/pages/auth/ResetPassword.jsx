import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../../services/authService'
import { getErrorMessage } from '../../services/api'
import { isStrongPassword, passwordChecks } from '../../utils/validators'
import { Alert, Field, PasswordChecklist, PasswordInput, SubmitButton } from '../../components/common/Feedback'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert>This reset link is missing its token. Please request a new one.</Alert>
        <Link to="/forgot-password" className="font-semibold text-teal-700 hover:underline">Request a new link</Link>
      </div>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    const found = {}
    if (!isStrongPassword(pw)) found.password = 'Password does not meet all requirements'
    if (confirm !== pw) found.confirm = 'Passwords do not match'
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length) return
    setLoading(true)
    try {
      await authService.resetPassword(token, pw, confirm)
      navigate('/login', { replace: true, state: { notice: 'Password updated. Please sign in with your new password.' } })
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900">Choose a new password</h1>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {serverError && <Alert>{serverError}</Alert>}
        <Field id="password" label="New password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.password} />
          <PasswordChecklist checks={passwordChecks(pw)} />
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm}>
          <PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        </Field>
        <SubmitButton loading={loading} loadingText="Updating…">Update password</SubmitButton>
      </form>
    </div>
  )
}
