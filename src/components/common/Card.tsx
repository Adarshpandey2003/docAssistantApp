import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, elevation, radius, spacing } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Selected cards get the 2px primary border + soft blue tint from the spec. */
  selected?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({
  children,
  onPress,
  selected = false,
  padded = true,
  style,
  accessibilityLabel,
  testID,
}: CardProps) {
  const content = [
    styles.card,
    padded && styles.padded,
    selected && styles.selected,
    style,
  ];

  if (!onPress) {
    return (
      <View style={content} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [...content, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...elevation.card,
  },
  padded: { padding: spacing.md },
  selected: {
    borderWidth: 2,
    borderColor: colors.primaryContainer,
    backgroundColor: colors.primaryFixed,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
});
