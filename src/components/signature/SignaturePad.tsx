import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { colors, radius, spacing, typography, MIN_TOUCH, HIT_SLOP } from '../../constants/theme';

export const INK_COLORS = [
  { key: 'blue', value: '#1D4ED8', label: 'Blue ink' },
  { key: 'black', value: '#0F172A', label: 'Black ink' },
] as const;

export const STROKE_WIDTHS = [2.5, 4, 6] as const;

export interface CapturedSignature {
  /** PNG base64, transparent background, cropped tight to the ink. */
  pngBase64: string;
  /** width / height of the cropped image — use it to size the overlay. */
  aspectRatio: number;
  color: string;
}

export interface SignaturePadHandle {
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
  capture: () => Promise<CapturedSignature>;
}

export interface SignaturePadProps {
  color?: string;
  strokeWidth?: number;
  onStrokeCountChange?: (count: number) => void;
  height?: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY_BOUNDS: Bounds = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

/**
 * Finger/stylus signature capture.
 *
 * SVG paths + PanResponder, which is all Expo Go gives us — and is plenty: the
 * strokes are vectors while you draw, and only flatten to a PNG at capture time
 * because that is what pdf-lib can embed.
 *
 * Two details that matter:
 *  - The dotted baseline guide lives *outside* the <Svg>, so Svg.toDataURL()
 *    captures ink on transparency and never the guide.
 *  - We track an ink bounding box while drawing and crop to it afterwards, so
 *    the placed signature is tight rather than a mostly-empty canvas-sized box.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { color = INK_COLORS[0].value, strokeWidth = STROKE_WIDTHS[1], onStrokeCountChange, height = 168 },
  ref
) {
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [size, setSize] = useState({ width: 0, height });

  const svgRef = useRef<Svg>(null);
  const boundsRef = useRef<Bounds>({ ...EMPTY_BOUNDS });
  // Bounds per stroke, so undo can rebuild the overall box correctly.
  const strokeBoundsRef = useRef<Bounds[]>([]);
  const currentBoundsRef = useRef<Bounds>({ ...EMPTY_BOUNDS });
  const currentPathRef = useRef<string>('');

  const track = (bounds: Bounds, x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };

  const recomputeBounds = () => {
    const next = { ...EMPTY_BOUNDS };
    strokeBoundsRef.current.forEach((b) => {
      next.minX = Math.min(next.minX, b.minX);
      next.minY = Math.min(next.minY, b.minY);
      next.maxX = Math.max(next.maxX, b.maxX);
      next.maxY = Math.max(next.maxY, b.maxY);
    });
    boundsRef.current = next;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Keep the parent ScrollView from stealing the gesture mid-stroke.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          currentBoundsRef.current = { ...EMPTY_BOUNDS };
          track(currentBoundsRef.current, locationX, locationY);
          currentPathRef.current = `M ${locationX.toFixed(2)} ${locationY.toFixed(2)}`;
          setCurrent(currentPathRef.current);
        },

        onPanResponderMove: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          track(currentBoundsRef.current, locationX, locationY);
          currentPathRef.current += ` L ${locationX.toFixed(2)} ${locationY.toFixed(2)}`;
          setCurrent(currentPathRef.current);
        },

        onPanResponderRelease: () => {
          const path = currentPathRef.current;
          if (!path) return;

          strokeBoundsRef.current.push({ ...currentBoundsRef.current });
          recomputeBounds();

          setPaths((prev) => [...prev, path]);
          currentPathRef.current = '';
          setCurrent('');
          // Outside the updater: React runs those during render, and notifying
          // the parent from there is a setState-while-rendering violation.
          onStrokeCountChange?.(strokeBoundsRef.current.length);
        },
      }),
    [onStrokeCountChange]
  );

  const clear = useCallback(() => {
    setPaths([]);
    setCurrent('');
    currentPathRef.current = '';
    strokeBoundsRef.current = [];
    boundsRef.current = { ...EMPTY_BOUNDS };
    onStrokeCountChange?.(0);
  }, [onStrokeCountChange]);

  const undo = useCallback(() => {
    strokeBoundsRef.current = strokeBoundsRef.current.slice(0, -1);
    recomputeBounds();
    setPaths((prev) => prev.slice(0, -1));
    onStrokeCountChange?.(strokeBoundsRef.current.length);
  }, [onStrokeCountChange]);

  const capture = useCallback(async (): Promise<CapturedSignature> => {
    if (!paths.length) {
      throw new Error('Draw your signature first.');
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const node = svgRef.current as unknown as
        | { toDataURL?: (cb: (data: string) => void) => void }
        | null;

      if (!node?.toDataURL) {
        reject(new Error('The signature could not be captured on this device.'));
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error('The signature could not be captured. Please try again.')),
        8000
      );
      node.toDataURL((data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // Write it out so ImageManipulator can crop it to the ink.
    const cacheDir = FileSystem.cacheDirectory ?? '';
    const rawUri = `${cacheDir}signature-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(rawUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const probe = await ImageManipulator.manipulateAsync(rawUri, []);
    const scaleX = probe.width / Math.max(1, size.width);
    const scaleY = probe.height / Math.max(1, size.height);

    // Pad by the stroke width so round caps are not shaved off.
    const pad = strokeWidth * 1.5;
    const b = boundsRef.current;
    const left = Math.max(0, (b.minX - pad) * scaleX);
    const top = Math.max(0, (b.minY - pad) * scaleY);
    const right = Math.min(probe.width, (b.maxX + pad) * scaleX);
    const bottom = Math.min(probe.height, (b.maxY + pad) * scaleY);

    const cropWidth = Math.max(1, Math.round(right - left));
    const cropHeight = Math.max(1, Math.round(bottom - top));

    const cropped = await ImageManipulator.manipulateAsync(
      rawUri,
      [
        {
          crop: {
            originX: Math.round(left),
            originY: Math.round(top),
            width: cropWidth,
            height: cropHeight,
          },
        },
      ],
      { format: ImageManipulator.SaveFormat.PNG, base64: true }
    );

    await FileSystem.deleteAsync(rawUri, { idempotent: true }).catch(() => undefined);

    if (!cropped.base64) {
      throw new Error('The signature could not be captured. Please try again.');
    }

    return {
      pngBase64: cropped.base64,
      aspectRatio: cropWidth / cropHeight,
      color,
    };
  }, [paths.length, size.width, size.height, strokeWidth, color]);

  useImperativeHandle(
    ref,
    () => ({ clear, undo, capture, isEmpty: () => paths.length === 0 }),
    [clear, undo, capture, paths.length]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ width, height: h });
  };

  const isEmpty = paths.length === 0 && !current;

  return (
    <View style={[styles.canvas, { height }]} onLayout={onLayout}>
      {/* Guides sit behind the Svg so they never end up in the captured PNG. */}
      <View pointerEvents="none" style={styles.guideLayer}>
        <View style={styles.baseline} />
        {isEmpty ? <Text style={[typography.bodyMd, styles.hint]}>Sign above the line</Text> : null}
      </View>

      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Svg ref={svgRef} width="100%" height="100%">
          {paths.map((d, i) => (
            <Path
              key={`${i}-${d.length}`}
              d={d}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {current ? (
            <Path
              d={current}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
      </View>

      {!isEmpty ? (
        <Pressable
          onPress={undo}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Undo last stroke"
          style={styles.undo}
        >
          <Text style={[typography.labelMd, { color: colors.primary, fontWeight: '600' }]}>
            Undo
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  guideLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  baseline: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    bottom: 36,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
  },
  hint: { textAlign: 'center', marginBottom: spacing.sm + 4, color: colors.outline },
  undo: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.sm + 4,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLowest,
  },
  minTouch: { minHeight: MIN_TOUCH },
});

export default SignaturePad;
