import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';

import { colors, radius, spacing, typography, MIN_TOUCH } from '../../constants/theme';

export interface CropOverlayProps {
  visible: boolean;
  uri: string | null;
  /** Leave without cropping. The caller decides what "leave" means. */
  onCancel: () => void;
  /** Receives the URI of a freshly written, cropped copy. */
  onCropped: (uri: string) => void;
  title?: string;
  /**
   * Label for the non-destructive exit. "Cancel" when the user opened the crop
   * themselves; "Use as is" when we offered it after a capture or an import.
   */
  skipLabel?: string;
  /** Position in a queue of images, e.g. "2 of 5". */
  counter?: string;
  /** Shown only when several images are queued — leaves the rest untouched. */
  onSkipAll?: () => void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const HANDLE = 28;
const MIN_CROP = 56;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Free-form crop. The image is laid out "contain"-style inside the measured
 * stage, the crop box lives in *display* pixels, and only at Apply time is it
 * divided by the display scale to get source-pixel coordinates for
 * expo-image-manipulator. Keeping the box in display space is what makes the
 * handles feel exact regardless of the source resolution.
 */
export function CropOverlay({
  visible,
  uri,
  onCancel,
  onCropped,
  title = 'Crop page',
  skipLabel = 'Cancel',
  counter,
  onSkipAll,
}: CropOverlayProps) {
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  const boxRef = useRef<Box | null>(null);
  boxRef.current = box;
  const startRef = useRef<Box | null>(null);

  // Reset whenever a different page is opened.
  useEffect(() => {
    setNatural(null);
    setBox(null);
    if (!uri || !visible) return;
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => alive && setNatural({ width, height }),
      () => alive && setNatural(null)
    );
    return () => {
      alive = false;
    };
  }, [uri, visible]);

  /** Where the image actually paints inside the stage, "contain" style. */
  const frame = useMemo<Box | null>(() => {
    if (!natural || !stage.width || !stage.height) return null;
    const scale = Math.min(stage.width / natural.width, stage.height / natural.height);
    const width = natural.width * scale;
    const height = natural.height * scale;
    return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
  }, [natural, stage]);

  // Start with a small inset so it is obvious the box is draggable.
  useEffect(() => {
    if (!frame || box) return;
    const inset = Math.min(frame.width, frame.height) * 0.06;
    setBox({
      x: frame.x + inset,
      y: frame.y + inset,
      width: frame.width - inset * 2,
      height: frame.height - inset * 2,
    });
  }, [frame, box]);

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = boxRef.current;
        },
        onPanResponderMove: (_evt, g) => {
          const start = startRef.current;
          if (!start || !frame) return;
          setBox({
            ...start,
            x: clamp(start.x + g.dx, frame.x, frame.x + frame.width - start.width),
            y: clamp(start.y + g.dy, frame.y, frame.y + frame.height - start.height),
          });
        },
      }),
    [frame]
  );

  const cornerResponders = useMemo(() => {
    const make = (corner: Corner) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = boxRef.current;
        },
        onPanResponderMove: (_evt, g) => {
          const s = startRef.current;
          if (!s || !frame) return;

          const left = frame.x;
          const top = frame.y;
          const right = frame.x + frame.width;
          const bottom = frame.y + frame.height;

          // Each corner moves two edges; the opposite two stay pinned.
          let x1 = s.x;
          let y1 = s.y;
          let x2 = s.x + s.width;
          let y2 = s.y + s.height;

          if (corner === 'tl' || corner === 'bl') x1 = clamp(s.x + g.dx, left, x2 - MIN_CROP);
          else x2 = clamp(s.x + s.width + g.dx, x1 + MIN_CROP, right);

          if (corner === 'tl' || corner === 'tr') y1 = clamp(s.y + g.dy, top, y2 - MIN_CROP);
          else y2 = clamp(s.y + s.height + g.dy, y1 + MIN_CROP, bottom);

          setBox({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
        },
      });
    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [frame]);

  const reset = () => {
    if (!frame) return;
    setBox({ ...frame });
  };

  const apply = async () => {
    if (!uri || !box || !frame || !natural || busy) return;
    setBusy(true);
    try {
      const scale = natural.width / frame.width;
      const originX = Math.max(0, Math.round((box.x - frame.x) * scale));
      const originY = Math.max(0, Math.round((box.y - frame.y) * scale));
      const width = Math.min(natural.width - originX, Math.round(box.width * scale));
      const height = Math.min(natural.height - originY, Math.round(box.height * scale));

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCropped(result.uri);
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage({ width, height });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onCancel}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerButton} accessibilityRole="button">
            <MaterialCommunityIcons name="close" size={22} color={colors.onPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[typography.titleMd, styles.headerTitle]}>{title}</Text>
            {counter ? (
              <Text style={[typography.labelSm, styles.headerCounter]}>{counter}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={reset}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Reset the crop box"
          >
            <MaterialCommunityIcons name="backup-restore" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={onStageLayout}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}

          {box ? (
            <>
              {/* Scrim: four rectangles around the crop box. */}
              <View pointerEvents="none" style={[styles.scrim, { height: box.y, top: 0, left: 0, right: 0 }]} />
              <View
                pointerEvents="none"
                style={[styles.scrim, { top: box.y + box.height, bottom: 0, left: 0, right: 0 }]}
              />
              <View
                pointerEvents="none"
                style={[styles.scrim, { top: box.y, height: box.height, left: 0, width: box.x }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.scrim,
                  { top: box.y, height: box.height, left: box.x + box.width, right: 0 },
                ]}
              />

              <View
                {...moveResponder.panHandlers}
                style={[
                  styles.box,
                  { left: box.x, top: box.y, width: box.width, height: box.height },
                ]}
              >
                {/* Rule-of-thirds guides. */}
                <View pointerEvents="none" style={[styles.gridLine, { left: '33.33%', width: 1, top: 0, bottom: 0 }]} />
                <View pointerEvents="none" style={[styles.gridLine, { left: '66.66%', width: 1, top: 0, bottom: 0 }]} />
                <View pointerEvents="none" style={[styles.gridLine, { top: '33.33%', height: 1, left: 0, right: 0 }]} />
                <View pointerEvents="none" style={[styles.gridLine, { top: '66.66%', height: 1, left: 0, right: 0 }]} />
              </View>

              {CORNERS.map((corner) => {
                const left = corner === 'tl' || corner === 'bl' ? box.x : box.x + box.width;
                const top = corner === 'tl' || corner === 'tr' ? box.y : box.y + box.height;
                return (
                  <View
                    key={corner}
                    {...cornerResponders[corner].panHandlers}
                    accessibilityLabel={`Resize ${corner} corner`}
                    style={[styles.handle, { left: left - HANDLE / 2, top: top - HANDLE / 2 }]}
                  >
                    <View style={styles.handleDot} />
                  </View>
                );
              })}
            </>
          ) : (
            <ActivityIndicator color={colors.onPrimary} />
          )}
        </View>

        {onSkipAll ? (
          <Pressable
            onPress={onSkipAll}
            style={styles.skipAll}
            accessibilityRole="button"
            accessibilityLabel="Skip cropping for all remaining images"
          >
            <Text style={[typography.labelMd, styles.skipAllLabel]}>Skip cropping for all</Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable onPress={onCancel} style={styles.footerButton} accessibilityRole="button">
            <Text style={[typography.titleMd, styles.footerLabel]}>{skipLabel}</Text>
          </Pressable>
          <Pressable
            onPress={apply}
            disabled={busy || !box}
            style={[styles.footerButton, styles.applyButton, busy && styles.disabled]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[typography.titleMd, styles.applyLabel]}>Apply crop</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1020' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  headerButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: colors.onPrimary },
  headerCounter: { color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  skipAll: {
    alignSelf: 'center',
    minHeight: MIN_TOUCH - 10,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  skipAllLabel: { color: 'rgba(255,255,255,0.75)', textDecorationLine: 'underline' },

  stage: { flex: 1, margin: spacing.gutter, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', backgroundColor: 'rgba(11, 16, 32, 0.66)' },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.onPrimary,
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.onPrimary,
    borderWidth: 3,
    borderColor: colors.primaryContainer,
  },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: { color: 'rgba(255,255,255,0.8)' },
  applyButton: { backgroundColor: colors.primaryContainer },
  applyLabel: { color: colors.onPrimary },
  disabled: { opacity: 0.6 },
});

export default CropOverlay;
