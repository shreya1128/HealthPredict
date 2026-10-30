import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'

export function Spinner({ label = 'Loading' }) {
  return <Loader2 className="h-6 w-6 animate-spin text-teal-600" role="status" aria-label={label} />
}

export function Alert({ kind = 'error', children }) {
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2
  const style = kind === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3 text-sm ${style}`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}

export const inputClass = (hasError) =>
  `w-full rounded-lg border px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
    hasError ? 'border-red-400' : 'border-slate-300'
  }`

export function PasswordInput({ id, error, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id} type={show ? 'text' : 'password'} aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass(error)} pr-11`} {...props}
      />
      <button
        type="button" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-r-lg"
      >
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  )
}

export function SubmitButton({ loading, children, loadingText }) {
  return (
    <button
      type="submit" disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  )
}

export function PasswordChecklist({ checks }) {
  return (
    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? 'text-emerald-700' : 'text-slate-500'}>
          <span aria-hidden="true">{c.ok ? '✓' : '○'}</span> {c.label}
          <span className="sr-only">{c.ok ? ' (met)' : ' (not met)'}</span>
        </li>
      ))}
    </ul>
  )
}
