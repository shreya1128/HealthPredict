// Client-side checks mirror the backend rules (backend/app/schemas/auth.py) for instant feedback.
// The server remains the source of truth.

export const passwordChecks = (pw = '') => [
  { id: 'length', label: 'At least 8 characters', ok: pw.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', ok: /[A-Z]/.test(pw) },
  { id: 'lower', label: 'A lowercase letter', ok: /[a-z]/.test(pw) },
  { id: 'digit', label: 'A number', ok: /\d/.test(pw) },
  { id: 'special', label: 'A special character', ok: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pw) },
]

export const isStrongPassword = (pw) =>
  passwordChecks(pw).every((c) => c.ok) && new TextEncoder().encode(pw).length <= 72

export const isEmail = (v = '') => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

export function isValidDob(value) {
  if (!value) return true // optional
  const d = new Date(value)
  return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900
}
