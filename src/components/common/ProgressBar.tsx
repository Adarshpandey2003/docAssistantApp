import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../constants/theme';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  label?: string;
  /** Plain-language line under the bar, per the design spec. */
  status?: string;
  tone?: 'progress' | 'success';
}

/**
 * Determinate progress. The spec pairs the bar with a percentage and a
 * human-readable status line so the user always knows what is happening.
 */
export function ProgressBar({ value, label, status, tone = 'progress' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = tone === 'success' ? colors.secondary : colors.tertiaryContainer;
  const textColor = tone === 'success' ? colors.secondary : colors.tertiaryContainer;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[typography.titleMd, { color: textColor }]}>{label}</Text>
          <Text style={[typography.titleMd, { color: textColor }]}>{Math.round(pct * 100)}%</Text>
        </View>
      ) : null}

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fill }]} />
      </View>

      {status ? (
        <Text style={[typography.bodyMd, styles.status]} numberOfLines={2}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  track: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
  status: { marginTop: spacing.sm },
});
