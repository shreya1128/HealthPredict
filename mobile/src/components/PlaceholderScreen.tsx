import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';

import { AppText } from './ui/AppText';
import { EmptyState } from './ui/EmptyState';
import { Screen } from './ui/Screen';

/** Honest "not built yet" screen for sections that arrive in later phases. Shows no fake data. */
export function PlaceholderScreen({
  title,
  icon,
  heading,
  message,
  showTitle = true,
}: {
  title: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  heading: string;
  message: string;
  showTitle?: boolean;
}) {
  useStatusBarStyle('dark');
  return (
    <Screen>
      {showTitle ? <AppText variant="h1">{title}</AppText> : null}
      <EmptyState icon={icon} title={heading} message={message} />
    </Screen>
  );
}
