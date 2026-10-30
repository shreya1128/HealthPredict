import { colors } from '@/theme';

export interface RiskPalette {
  label: string;
  fg: string;
  bg: string;
}

/** Presentation only: the category itself always comes from the backend. */
export function riskPalette(category: string | null | undefined): RiskPalette {
  switch ((category ?? '').toUpperCase()) {
    case 'LOW':
      return { label: 'Low risk', fg: colors.success, bg: colors.successSoft };
    case 'MODERATE':
      return { label: 'Moderate risk', fg: colors.warning, bg: colors.warningSoft };
    case 'HIGH':
      return { label: 'High risk', fg: colors.danger, bg: colors.dangerSoft };
    default:
      return { label: category ? category.replace(/_/g, ' ').toLowerCase() : 'Not rated', fg: colors.textMuted, bg: colors.bg };
  }
}

/** "2026-10-07" -> "7 Oct 2026". Parsed as a local date so the day never shifts with time zones. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "08:30:00" -> "08:30" */
export const formatTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export const percent = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '' : `${n.toFixed(digits)}%`);
