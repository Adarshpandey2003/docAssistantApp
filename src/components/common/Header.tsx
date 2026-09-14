import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, spacing, typography, HIT_SLOP, MIN_TOUCH, radius } from '../../constants/theme';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  /** Optional trailing control, e.g. the "Done" / "Save" action. */
  right?: React.ReactNode;
  /** Small caption under the title, e.g. "Offline storage". */
  subtitle?: string;
}

export function Header({ title, onBack, right, subtitle }: HeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.titleWrap}>
        <Text style={[typography.titleLg, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.labelSm, styles.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  side: { minWidth: 64, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfaceHigh },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 1 },
});
