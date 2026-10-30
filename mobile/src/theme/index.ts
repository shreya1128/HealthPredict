import type { TextStyle, ViewStyle } from 'react-native';

/** HealthPredict design tokens. Teal-led healthcare palette on cool neutral backgrounds. */
export const colors = {
  // Brand
  primary: '#0F766E', // teal-700: white text on it passes WCAG AA
  primaryDeep: '#115E59',
  primaryMid: '#0D9488',
  primarySoft: '#CCFBF1',
  primaryTint: '#F0FDFA',
  accent: '#0E7490', // cyan-700
  accentSoft: '#CFFAFE',
  blue: '#1D4ED8',
  blueSoft: '#DBEAFE',
  green: '#047857',
  greenSoft: '#D1FAE5',

  // Neutrals
  bg: '#F4F8FA',
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#64748B',
  placeholder: '#94A3B8',
  onPrimary: '#FFFFFF',

  // Status
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  success: '#047857',
  successSoft: '#D1FAE5',
  info: '#0E7490',
  infoSoft: '#CFFAFE',
} as const;

export type ColorName = keyof typeof colors;

export const gradients = {
  brand: ['#0F766E', '#0E7490'] as const,
  hero: ['#115E59', '#0F766E', '#0E7490'] as const,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, xxl: 28, pill: 999 } as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const shadows = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} satisfies Record<string, ViewStyle>;

/** Minimum touch target, per platform accessibility guidance. */
export const TOUCH_TARGET = 44;
