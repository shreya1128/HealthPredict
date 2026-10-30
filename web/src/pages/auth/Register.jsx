import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../../services/authService'
import { getErrorMessage } from '../../services/api'
import { isEmail, isStrongPassword, isValidDob, passwordChecks } from '../../utils/validators'
import { Alert, Field, PasswordChecklist, PasswordInput, SubmitButton, inputClass } from '../../components/common/Feedback'
import { useAuth } from '../../context/AuthContext'

const detectDeviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const empty = {
  full_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  gender: 'OTHER',
  timezone: detectDeviceTimezone(),
  password: '',
  confirm_password: '',
}

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function validate() {
    const e = {}
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name'
    if (!isEmail(form.email)) e.email = 'Enter a valid email address'
    if (!isValidDob(form.date_of_birth)) e.date_of_birth = 'Enter a valid date of birth'
    if (!isStrongPassword(form.password)) e.password = 'Password does not meet all requirements'
    if (form.confirm_password !== form.password) e.confirm_password = 'Passwords do not match'
    return e
  }

  async function onSubmit(ev) {
    ev.preventDefault()
    const found = validate()
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length) return
    setLoading(true)
    try {
      const payload = { ...form, full_name: form.full_name.trim(), email: form.email.trim() }
      if (!payload.phone) delete payload.phone
      if (!payload.date_of_birth) delete payload.date_of_birth
      await authService.register(payload)
      try {
        await login(payload.email, payload.password)
        navigate('/onboarding', { replace: true })
      } catch {
        navigate('/login', { replace: true, state: { notice: 'Account created. Please sign in.' } })
      }
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const bind = (id, label, type = 'text', extra = {}) => (
    <Field id={id} label={label} error={errors[id]}>
      <input id={id} type={type} value={form[id]} onChange={set(id)} aria-invalid={Boolean(errors[id])}
        aria-describedby={errors[id] ? `${id}-error` : undefined} className={inputClass(errors[id])} {...extra} />
    </Field>
  )

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900">Create your account</h1>
      <p className="mt-1 text-slate-600">Start tracking your health in minutes.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        {bind('full_name', 'Full name', 'text', { autoComplete: 'name' })}
        {bind('email', 'Email', 'email', { autoComplete: 'email' })}
        <div className="grid sm:grid-cols-2 gap-4">
          {bind('phone', 'Phone (optional)', 'tel', { autoComplete: 'tel' })}
          {bind('date_of_birth', 'Date of birth', 'date', { autoComplete: 'bday' })}
        </div>
        <Field id="gender" label="Gender">
          <select id="gender" value={form.gender} onChange={set('gender')} className={inputClass(false)}>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other / prefer not to say</option>
          </select>
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
          <PasswordChecklist checks={passwordChecks(form.password)} />
        </Field>
        <Field id="confirm_password" label="Confirm password" error={errors.confirm_password}>
          <PasswordInput id="confirm_password" autoComplete="new-password" value={form.confirm_password}
            onChange={set('confirm_password')} error={errors.confirm_password} />
        </Field>
        <SubmitButton loading={loading} loadingText="Creating account…">Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered? <Link to="/login" className="font-semibold text-teal-700 hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
