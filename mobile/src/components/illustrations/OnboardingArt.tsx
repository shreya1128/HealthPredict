import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/** Locally drawn, resolution-independent illustrations (no external images, no licensing concerns). */
const W = 300;
const H = 240;
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function Backdrop() {
  return (
    <>
      <Circle cx={150} cy={120} r={104} fill={colors.primarySoft} opacity={0.55} />
      <Circle cx={150} cy={120} r={74} fill={colors.primarySoft} />
    </>
  );
}

/** Slide 1 - understanding your health: heart + pulse, a small score card and a shield. */
export function HealthArt() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Illustration of a heart with a pulse line">
      <Backdrop />
      <G transform="translate(92 62) scale(4.6)">
        <Path d={HEART} fill={colors.primary} />
      </G>
      <Path d="M96 124H128L140 98L158 150L170 114L178 124H206" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <G transform="translate(206 36)">
        <Rect width={70} height={54} rx={12} fill="#FFFFFF" />
        <Rect x={12} y={28} width={9} height={14} rx={3} fill={colors.accentSoft} />
        <Rect x={30} y={20} width={9} height={22} rx={3} fill={colors.primaryMid} />
        <Rect x={48} y={12} width={9} height={30} rx={3} fill={colors.primary} />
      </G>
      <G transform="translate(30 150)">
        <Circle cx={22} cy={22} r={22} fill="#FFFFFF" />
        <Path d="M22 10l10 4v8c0 7-4.5 11-10 13-5.5-2-10-6-10-13v-8z" fill={colors.greenSoft} stroke={colors.green} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M17.5 22l3.5 3.5 6-7" stroke={colors.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Svg>
  );
}

function Capsule({ x, y, rotate, a, b }: { x: number; y: number; rotate: number; a: string; b: string }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Rect x={-44} y={-18} width={88} height={36} rx={18} fill={b} />
      <Path d="M-26 -18H0V18H-26A18 18 0 0 1 -26 -18Z" fill={a} />
      <Rect x={-36} y={-12} width={72} height={6} rx={3} fill="#FFFFFF" opacity={0.28} />
    </G>
  );
}

/** Slide 2 - medicines: capsules, a clock and a "taken" tick. */
export function MedicineArt() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Illustration of medicine capsules and a clock">
      <Backdrop />
      <Capsule x={128} y={104} rotate={-35} a={colors.primary} b="#FFFFFF" />
      <Capsule x={150} y={150} rotate={20} a={colors.blue} b="#FFFFFF" />
      <G transform="translate(206 40)">
        <Circle cx={36} cy={36} r={36} fill="#FFFFFF" />
        <Circle cx={36} cy={36} r={29} fill={colors.primaryTint} stroke={colors.primarySoft} strokeWidth={2} />
        <Path d="M36 18V37L48 44" stroke={colors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
      <G transform="translate(36 56)">
        <Circle cx={22} cy={22} r={22} fill={colors.green} />
        <Path d="M12 23l7 7 13-14" stroke="#FFFFFF" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Svg>
  );
}

const DROP = 'M0 -13C7 -3 10 2 10 6A10 10 0 0 1 -10 6C-10 2 -7 -3 0 -13Z';

/** Slide 3 - healthy habits: a rising trend card, a water drop and a moon. */
export function WellnessArt() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Illustration of a rising progress chart">
      <Backdrop />
      <G transform="translate(62 54)">
        <Rect width={176} height={116} rx={18} fill="#FFFFFF" />
        <Path d="M18 88L52 62L80 74L118 38L156 24" stroke={colors.primary} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={52} cy={62} r={5.5} fill="#FFFFFF" stroke={colors.primary} strokeWidth={3} />
        <Circle cx={118} cy={38} r={5.5} fill="#FFFFFF" stroke={colors.primary} strokeWidth={3} />
        <Circle cx={156} cy={24} r={7} fill={colors.primary} />
        <Rect x={18} y={98} width={140} height={4} rx={2} fill={colors.border} />
      </G>
      <G transform="translate(52 188)">
        <Circle r={22} fill="#FFFFFF" />
        <G transform="translate(0 2) scale(0.95)">
          <Path d={DROP} fill={colors.accent} />
        </G>
      </G>
      <G transform="translate(248 186)">
        <Circle r={22} fill="#FFFFFF" />
        <Path d="M6 -13A14 14 0 1 0 12 7A11 11 0 0 1 6 -13Z" fill={colors.blue} />
      </G>
    </Svg>
  );
}
