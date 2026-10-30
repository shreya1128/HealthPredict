import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography, type ColorName, type TypographyVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorName;
  center?: boolean;
}

export function AppText({ variant = 'body', color = 'text', center, style, ...rest }: AppTextProps) {
  const base: TextStyle = { ...typography[variant], color: colors[color] };
  if (center) base.textAlign = 'center';
  return <Text {...rest} style={[base, style]} />;
}
