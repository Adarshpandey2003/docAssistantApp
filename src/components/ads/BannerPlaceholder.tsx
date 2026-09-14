import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../constants/theme';

export interface BannerPlaceholderProps {
  height?: number;
}

/**
 * Debug-only stand-in that shows where a banner *would* sit.
 *
 * This is never rendered in V1 — AdContainer returns null before it gets here.
 * It exists so you can eyeball layout impact before flipping ADS_ENABLED, by
 * temporarily passing `debugPlaceholder` to AdContainer.
 */
export function BannerPlaceholder({ height = 50 }: BannerPlaceholderProps) {
  return (
    <View style={[styles.box, { height }]} pointerEvents="none">
      <Text style={typography.labelSm}>Ad slot ({height}dp)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.gutter,
    marginVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
  },
});
