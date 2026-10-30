import { MaterialCommunityIcons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  leftIcon?: IconName;
  /** Adds a show/hide toggle. Implies secureTextEntry while hidden. */
  password?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, leftIcon, password, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.field, focused && styles.focused, !!error && styles.errored]}>
        {leftIcon ? <MaterialCommunityIcons name={leftIcon} size={20} color={focused ? colors.primary : colors.textSubtle} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          {...rest}
          secureTextEntry={password ? hidden : rest.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden((h) => !h)}
          >
            <MaterialCommunityIcons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle" style={styles.message}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  focused: { borderColor: colors.primaryMid, backgroundColor: colors.primaryTint },
  errored: { borderColor: colors.danger, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  message: { marginTop: 6 },
});
