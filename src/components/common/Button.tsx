import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, typography, MIN_TOUCH } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const FILL: Record<Variant, string> = {
  primary: colors.primaryContainer,
  secondary: colors.surfaceLowest,
  ghost: colors.transparent,
  danger: colors.errorContainer,
};

const FG: Record<Variant, string> = {
  primary: colors.onPrimary,
  secondary: colors.onSurface,
  ghost: colors.primary,
  danger: colors.onErrorContainer,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  testID,
}: ButtonProps) {
  const inert = disabled || loading;
  const fg = FG[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        { backgroundColor: FILL[variant] },
        variant === 'secondary' && styles.outlined,
        fullWidth && styles.fullWidth,
        pressed && !inert && styles.pressed,
        inert && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? (
            <MaterialCommunityIcons name={icon} size={20} color={fg} style={styles.icon} />
          ) : null}
          <Text style={[typography.titleMd, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  md: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4 },
  lg: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56 },
  outlined: { borderWidth: 1, borderColor: colors.outlineVariant },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
});
