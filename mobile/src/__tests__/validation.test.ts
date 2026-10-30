import {
  byteLength, formatDateInput, validateDateOfBirth, validateEmail, validateFullName, validatePassword,
} from '@/utils/validation';

describe('validatePassword (mirrors backend rules)', () => {
  it('accepts a strong password', () => expect(validatePassword('Str0ng!Pass')).toBeNull());
  it.each([
    ['Sh0rt!a', 'at least 8'],
    ['alllower1!', 'uppercase'],
    ['ALLUPPER1!', 'lowercase'],
    ['NoDigits!!', 'number'],
    ['NoSpecial12', 'special'],
  ])('rejects %s', (pw, needle) => expect(validatePassword(pw)?.toLowerCase()).toContain(needle));
  it('enforces bcrypt 72-byte limit by bytes, not characters', () => {
    const emoji = 'Aa1!' + '😀'.repeat(18); // 4 + 18*4 = 76 bytes, only 22 characters
    expect(byteLength(emoji)).toBe(76);
    expect(validatePassword(emoji)).toMatch(/72 bytes/);
  });
  it('rejects empty', () => expect(validatePassword('')).toBeTruthy());
});

describe('validateEmail / validateFullName', () => {
  it('validates emails', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail(' a@b.co ')).toBeNull();
    expect(validateEmail('nope')).toBeTruthy();
    expect(validateEmail('a@b')).toBeTruthy();
    expect(validateEmail('')).toBeTruthy();
  });
  it('requires a real name', () => {
    expect(validateFullName('A')).toBeTruthy();
    expect(validateFullName('  ')).toBeTruthy();
    expect(validateFullName('Asha Rao')).toBeNull();
  });
});

describe('validateDateOfBirth', () => {
  const today = new Date(2026, 9, 7);
  it('treats empty as valid (optional)', () => expect(validateDateOfBirth('', today)).toBeNull());
  it('accepts a normal date and today', () => {
    expect(validateDateOfBirth('1990-03-15', today)).toBeNull();
    expect(validateDateOfBirth('2026-10-07', today)).toBeNull();
  });
  it.each(['15-03-1990', '1990-3-5', '1990-02-30', '1990-13-01', '1899-12-31', '2026-10-08'])('rejects %s', (v) =>
    expect(validateDateOfBirth(v, today)).toBeTruthy(),
  );
});

describe('formatDateInput', () => {
  it('auto-inserts hyphens and caps at 8 digits', () => {
    expect(formatDateInput('1990')).toBe('1990');
    expect(formatDateInput('199003')).toBe('1990-03');
    expect(formatDateInput('19900315')).toBe('1990-03-15');
    expect(formatDateInput('1990-03-15999')).toBe('1990-03-15');
    expect(formatDateInput('ab12')).toBe('12');
  });
});
