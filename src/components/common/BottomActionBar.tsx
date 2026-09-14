import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../../constants/theme';

export interface BottomActionBarProps {
  children: React.ReactNode;
  /** Tiny reassurance caption under the CTA, e.g. "Runs entirely on your device". */
  caption?: string;
}

/**
 * Sticky bottom bar holding the single primary CTA for a screen.
 * White surface, top hairline, safe-area padded — exactly as specified.
 */
export function BottomActionBar({ children, caption }: BottomActionBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: spacing.md + insets.bottom }]}>
      {children}
      {caption ? (
        <Text style={[typography.labelSm, styles.caption]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  caption: { textAlign: 'center', marginTop: spacing.sm },
});
