import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../../constants/theme';

type Tone = 'neutral' | 'primary' | 'success' | 'progress' | 'danger';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceHigh, fg: colors.onSurfaceVariant },
  primary: { bg: colors.primaryFixed, fg: colors.onPrimaryFixedVariant },
  success: { bg: colors.secondaryTint, fg: colors.onSecondaryContainer },
  progress: { bg: colors.tertiaryFixed, fg: colors.onTertiaryFixedVariant },
  danger: { bg: colors.errorContainer, fg: colors.onErrorContainer },
};

export interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pill badge. Per principle 4 an icon always accompanies the colour so state is
 * never communicated by hue alone.
 */
export function Badge({ label, tone = 'neutral', icon, style }: BadgeProps) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]} accessibilityRole="text">
      {icon ? (
        <MaterialCommunityIcons name={icon} size={14} color={fg} style={styles.icon} />
      ) : null}
      <Text style={[typography.labelMd, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

/** The persistent "this app works without a network" reassurance from the spec. */
export function OfflineBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Badge
      label="Works offline — no account needed"
      tone="success"
      icon="cloud-off-outline"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
  },
  icon: { marginRight: spacing.xs + 2 },
});
