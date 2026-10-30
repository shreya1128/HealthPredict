/**
 * Client-side form checks. These mirror backend/app/schemas/auth.py ONLY to give instant feedback;
 * the server remains the authority and its messages are shown for anything this misses.
 */
export const PASSWORD_SPECIALS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** UTF-8 byte length without TextEncoder (not guaranteed on every JS engine build). */
export function byteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

const isUpper = (c: string) => c !== c.toLowerCase();
const isLower = (c: string) => c !== c.toUpperCase();
const isDigit = (c: string) => c >= '0' && c <= '9';

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (v) => [...v].some(isUpper) },
  { id: 'lower', label: 'A lowercase letter', test: (v) => [...v].some(isLower) },
  { id: 'digit', label: 'A number', test: (v) => [...v].some(isDigit) },
  { id: 'special', label: `A special character (${PASSWORD_SPECIALS.slice(0, 8)}…)`, test: (v) => [...v].some((c) => PASSWORD_SPECIALS.includes(c)) },
];

/** Returns the first problem, or null if the password satisfies the backend's rules. */
export function validatePassword(value: string): string | null {
  if (!value) return 'Enter a password';
  if (byteLength(value) > 72) return 'Password must be at most 72 bytes';
  const failed = PASSWORD_RULES.find((r) => !r.test(value));
  return failed ? `Password needs: ${failed.label.toLowerCase()}` : null;
}

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your email address';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Enter a valid email address';
  if (v.length > 255) return 'Email address is too long';
  return null;
}

export function validateFullName(value: string): string | null {
  const v = value.trim();
  if (v.length < 2) return 'Enter your full name (at least 2 characters)';
  if (v.length > 255) return 'Name is too long';
  return null;
}

/** Optional field: empty is valid. Expects YYYY-MM-DD. */
export function validateDateOfBirth(value: string, today = new Date()): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return 'Use the format YYYY-MM-DD';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return 'Enter a real date';
  if (y < 1900) return 'Date of birth is not valid';
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return 'Date of birth cannot be in the future';
  return null;
}

/** Formats digits as the user types: "19900315" -> "1990-03-15". */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
