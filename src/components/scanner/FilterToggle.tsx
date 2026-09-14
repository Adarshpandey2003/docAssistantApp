import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, typography, HIT_SLOP } from '../../constants/theme';
import { FILTER_LABELS, FILTER_ORDER, type ScanFilter } from './imageFilters';

export interface FilterToggleProps {
  value: ScanFilter;
  onChange: (next: ScanFilter) => void;
  onCrop?: () => void;
  onRotate?: () => void;
  disabled?: boolean;
}

/** The filter chip row plus the crop / rotate affordances from Screen 2. */
export function FilterToggle({ value, onChange, onCrop, onRotate, disabled }: FilterToggleProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {FILTER_ORDER.map((filter) => {
        const active = filter === value;
        return (
          <Pressable
            key={filter}
            onPress={() => onChange(filter)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={`${FILTER_LABELS[filter]} filter`}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                typography.labelMd,
                styles.chipLabel,
                active && styles.chipLabelActive,
              ]}
            >
              {FILTER_LABELS[filter]}
            </Text>
          </Pressable>
        );
      })}

      {onRotate || onCrop ? <View style={styles.divider} /> : null}

      {onCrop ? (
        <IconChip icon="crop" label="Crop page" onPress={onCrop} disabled={disabled} />
      ) : null}
      {onRotate ? (
        <IconChip icon="rotate-right" label="Rotate page" onPress={onRotate} disabled={disabled} />
      ) : null}
    </ScrollView>
  );
}

function IconChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        styles.iconChip,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.gutter, gap: spacing.sm, alignItems: 'center' },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  chipLabel: { color: colors.onSurfaceVariant, fontWeight: '600' },
  chipLabelActive: { color: colors.onPrimary },
  iconChip: { paddingHorizontal: spacing.sm + 4 },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: spacing.xs,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});

export default FilterToggle;
