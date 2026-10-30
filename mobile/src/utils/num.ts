/**
 * Backends differ in how they serialise decimals (JSON number vs string). Everything numeric that comes
 * from the API is normalised once, here, so screens can rely on `number | null`.
 */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Returns a shallow copy of `obj` with the listed keys coerced via toNum. */
export function coerce<T extends object>(obj: T, keys: readonly (keyof T)[]): T {
  const copy = { ...obj } as Record<string, unknown>;
  for (const k of keys) copy[k as string] = toNum(copy[k as string]);
  return copy as T;
}
