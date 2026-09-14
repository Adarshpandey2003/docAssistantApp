import React, { useMemo, useRef } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, elevation, HIT_SLOP } from '../../constants/theme';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DraggableSignatureProps {
  pngBase64: string;
  /** Position and size in container pixels. */
  rect: Rect;
  containerWidth: number;
  containerHeight: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: Rect) => void;
  onDuplicate: () => void;
  /** Re-draw this signature (ink colour is chosen in the capture sheet). */
  onReplace: () => void;
  onDelete: () => void;
  minSize?: number;
  /**
   * Zoom factor applied to the parent. Gesture deltas arrive in screen pixels,
   * so they have to be divided by it to stay in container coordinates —
   * otherwise the signature runs away from the finger once the page is zoomed.
   */
  scale?: number;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The signature as it sits on the page: draggable, corner-resizable, with the
 * floating duplicate / replace / delete toolbar from the design.
 *
 * Resizing keeps the captured aspect ratio and anchors the corner opposite the
 * one being dragged, which is what makes it feel like a real handle rather than
 * a scale factor. Everything is clamped to the page so a signature can never be
 * dragged off the area that will actually be stamped.
 */
export function DraggableSignature({
  pngBase64,
  rect,
  containerWidth,
  containerHeight,
  selected,
  onSelect,
  onChange,
  onDuplicate,
  onReplace,
  onDelete,
  minSize = 40,
  scale = 1,
}: DraggableSignatureProps) {
  const startRef = useRef<Rect>(rect);

  /**
   * Everything the gestures read, mirrored into a ref so the PanResponders can
   * be created exactly once.
   *
   * This is load-bearing: a PanResponder accumulates `dx`/`dy` inside the
   * gesture state it closed over at creation time. Rebuilding one mid-drag —
   * which is what happens when the memo depends on the parent's inline
   * `onChange`/`onSelect` — hands every move event a fresh state whose `dx` is
   * back to zero, so the signature jitters by a pixel and snaps back instead of
   * travelling with the finger.
   */
  const latest = useRef({ rect, containerWidth, containerHeight, minSize, scale, onChange, onSelect });
  latest.current = { rect, containerWidth, containerHeight, minSize, scale, onChange, onSelect };

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        // Do not let the page's pan/zoom responder take the drag away.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = latest.current.rect;
          latest.current.onSelect();
        },
        onPanResponderMove: (_e, g) => {
          const { containerWidth: cw, containerHeight: ch, scale: z } = latest.current;
          const s = startRef.current;
          latest.current.onChange({
            ...s,
            x: clamp(s.x + g.dx / z, 0, Math.max(0, cw - s.width)),
            y: clamp(s.y + g.dy / z, 0, Math.max(0, ch - s.height)),
          });
        },
      }),
    []
  );

  const cornerResponders = useMemo(() => {
    const make = (corner: Corner) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = latest.current.rect;
          latest.current.onSelect();
        },
        onPanResponderMove: (_e, g) => {
          const { containerWidth: cw, containerHeight: ch, minSize: min, scale: z } = latest.current;
          const s = startRef.current;
          // The ratio is taken from the rect as it was when the handle was
          // grabbed, so rounding cannot drift it over a long drag.
          const aspect = s.width / Math.max(1, s.height);

          // Project the drag onto the corner's outward diagonal so both axes agree.
          const signX = corner === 'tr' || corner === 'br' ? 1 : -1;
          const signY = corner === 'bl' || corner === 'br' ? 1 : -1;
          const delta = (g.dx * signX + g.dy * signY) / (2 * z);

          const maxWidth = corner === 'tr' || corner === 'br' ? cw - s.x : s.x + s.width;
          const maxHeight = corner === 'bl' || corner === 'br' ? ch - s.y : s.y + s.height;

          let width = clamp(s.width + delta * 2, min, maxWidth);
          let height = width / aspect;

          if (height > maxHeight) {
            height = maxHeight;
            width = height * aspect;
          }

          // Anchor the opposite corner.
          const anchorRight = s.x + s.width;
          const anchorBottom = s.y + s.height;
          const x = corner === 'tl' || corner === 'bl' ? anchorRight - width : s.x;
          const y = corner === 'tl' || corner === 'tr' ? anchorBottom - height : s.y;

          latest.current.onChange({
            width,
            height,
            x: clamp(x, 0, Math.max(0, cw - width)),
            y: clamp(y, 0, Math.max(0, ch - height)),
          });
        },
      });
    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, []);

  return (
    <View
      style={[
        styles.frame,
        { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
        selected && styles.frameSelected,
      ]}
      {...moveResponder.panHandlers}
    >
      <Image
        source={{ uri: `data:image/png;base64,${pngBase64}` }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="Placed signature"
      />

      {selected ? (
        <>
          <View style={styles.toolbar} pointerEvents="box-none">
            <ToolbarButton icon="content-copy" label="Duplicate signature" onPress={onDuplicate} />
            <ToolbarButton icon="autorenew" label="Replace signature" onPress={onReplace} />
            <ToolbarButton
              icon="trash-can-outline"
              label="Delete signature"
              onPress={onDelete}
              tint={colors.error}
            />
          </View>

          {CORNERS.map((corner) => (
            <View
              key={corner}
              style={[styles.handle, cornerStyle(corner)]}
              {...cornerResponders[corner].panHandlers}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  tint = colors.onSurface,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarPressed]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={tint} />
    </Pressable>
  );
}

const HANDLE = 16;
const OFF = -HANDLE / 2;

function cornerStyle(corner: Corner) {
  switch (corner) {
    case 'tl':
      return { left: OFF, top: OFF };
    case 'tr':
      return { right: OFF, top: OFF };
    case 'bl':
      return { left: OFF, bottom: OFF };
    default:
      return { right: OFF, bottom: OFF };
  }
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  frameSelected: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryContainer,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(59, 110, 240, 0.06)',
  },
  image: { width: '100%', height: '100%' },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
    ...elevation.card,
  },
  toolbar: {
    position: 'absolute',
    top: -44,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...elevation.raised,
  },
  toolbarButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarPressed: { backgroundColor: colors.surfaceHigh },
});

export default DraggableSignature;
