import { View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { AppText } from './AppText';

/** Material "favorite" heart outline (24x24 viewBox) - scaled and centred inside the 64x64 mark below. */
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const PULSE = 'M17 34H24L28 25L33 42L37 31L39 34H47';

export function LogoMark({ size = 56, variant = 'color' }: { size?: number; variant?: 'color' | 'white' }) {
  const white = variant === 'white';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="HealthPredict logo">
      <Defs>
        <SvgGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0F766E" />
          <Stop offset="1" stopColor="#0E7490" />
        </SvgGradient>
      </Defs>
      <Rect width="64" height="64" rx="18" fill={white ? 'rgba(255,255,255,0.18)' : 'url(#lg)'} />
      <Path d={HEART} fill="#FFFFFF" transform="translate(9.5 10) scale(1.95)" />
      <Path d={PULSE} stroke="#0F766E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function Logo({ size = 56, variant = 'color', showWordmark = true }: { size?: number; variant?: 'color' | 'white'; showWordmark?: boolean }) {
  const color = variant === 'white' ? 'onPrimary' : 'text';
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <LogoMark size={size} variant={variant} />
      {showWordmark ? (
        <AppText variant="h1" color={color} style={{ letterSpacing: -0.3 }}>
          Health<AppText variant="h1" color={color} style={{ fontWeight: '300' }}>Predict</AppText>
        </AppText>
      ) : null}
    </View>
  );
}
