import { describe, expect, it } from 'vitest'
import { isEmail, isStrongPassword, isValidDob, passwordChecks } from './validators'

describe('password rules (must match the backend)', () => {
  it('accepts a strong password', () => expect(isStrongPassword('Str0ng!Passw0rd')).toBe(true))
  it.each(['Sh0rt!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoDigits!here', 'NoSpecial123abc'])(
    'rejects %s', (pw) => expect(isStrongPassword(pw)).toBe(false))
  it('rejects passwords over bcrypt\'s 72-byte limit', () => expect(isStrongPassword('Aa1!' + 'x'.repeat(80))).toBe(false))
  it('reports each unmet rule', () => {
    const failed = passwordChecks('abc').filter((c) => !c.ok).map((c) => c.id)
    expect(failed).toEqual(['length', 'upper', 'digit', 'special'])
  })
})

describe('email and date of birth', () => {
  it('validates emails', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('nope')).toBe(false)
    expect(isEmail('a b@c.com')).toBe(false)
  })
  it('validates dob', () => {
    expect(isValidDob('')).toBe(true)
    expect(isValidDob('1995-04-12')).toBe(true)
    expect(isValidDob('2999-01-01')).toBe(false)
    expect(isValidDob('1850-01-01')).toBe(false)
  })
})
