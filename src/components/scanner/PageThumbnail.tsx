import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, typography, elevation, HIT_SLOP } from '../../constants/theme';
import { FilteredImage } from './FilterCanvas';
import type { ScanFilter } from './imageFilters';

export const THUMB_WIDTH = 76;
export const THUMB_HEIGHT = 100;

export interface PageThumbnailProps {
  uri: string;
  index: number;
  filter: ScanFilter;
  selected: boolean;
  /** Lifted out of the strip while the user drags it to reorder. */
  dragging?: boolean;
  onPress: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
}

/**
 * One page in the reorderable strip: numbered badge, delete affordance, and the
 * lifted/tilted state that tells the user a long-press has picked it up.
 */
export function PageThumbnail({
  uri,
  index,
  filter,
  selected,
  dragging = false,
  onPress,
  onDelete,
  onLongPress,
}: PageThumbnailProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
      accessibilityRole="button"
      accessibilityLabel={`Page ${index + 1}`}
      accessibilityHint="Double tap to open. Touch and hold, then drag, to reorder."
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.wrap,
        selected && styles.selected,
        dragging && styles.dragging,
        pressed && !dragging && styles.pressed,
      ]}
    >
      <FilteredImage
        uri={uri}
        filter={filter}
        width={THUMB_WIDTH}
        height={THUMB_HEIGHT}
        borderRadius={radius.md}
      />

      <View style={styles.badge}>
        <Text style={[typography.labelSm, styles.badgeText]}>{index + 1}</Text>
      </View>

      <Pressable
        onPress={onDelete}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Remove page ${index + 1}`}
        style={styles.delete}
      >
        <MaterialCommunityIcons name="close" size={13} color={colors.onPrimary} />
      </Pressable>
    </Pressable>
  );
}

/** The trailing "+" tile that opens the camera or gallery for another page. */
export function AddPageTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add another page"
      style={({ pressed }) => [styles.wrap, styles.addTile, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
      <Text style={[typography.labelSm, styles.addLabel]}>Add page</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'visible',
  },
  selected: { borderWidth: 2, borderColor: colors.primaryContainer },
  dragging: {
    transform: [{ scale: 1.06 }, { rotate: '-4deg' }],
    ...elevation.raised,
    borderColor: colors.primaryContainer,
  },
  pressed: { opacity: 0.85 },
  badge: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.inverseSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.inverseOnSurface, fontWeight: '700' },
  delete: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceLowest,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceLow,
  },
  addLabel: { color: colors.primary, marginTop: 2, fontWeight: '600' },
});

export default PageThumbnail;
