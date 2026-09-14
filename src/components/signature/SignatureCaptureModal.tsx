import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Button } from '../common/Button';
import { colors, elevation, radius, spacing, typography, HIT_SLOP, MIN_TOUCH } from '../../constants/theme';
import {
  INK_COLORS,
  SignaturePad,
  STROKE_WIDTHS,
  type CapturedSignature,
  type SignaturePadHandle,
} from './SignaturePad';
import type { SavedSignature } from '../../services/storageService';

export interface SignatureCaptureModalProps {
  visible: boolean;
  saved: SavedSignature[];
  onClose: () => void;
  /** Fired with the fresh capture. The caller decides whether to persist it. */
  onCapture: (signature: CapturedSignature, remember: boolean) => void;
  onUseSaved: (signature: SavedSignature) => void;
  onDeleteSaved: (id: string) => void;
}

/**
 * The signature capture sheet from Stitch Screen 4: draw, pick ink and weight,
 * undo/clear, reuse a previous signature. Capture itself lives in SignaturePad,
 * which reads the SVG surface back as a tightly cropped transparent PNG.
 */
export function SignatureCaptureModal({
  visible,
  saved,
  onClose,
  onCapture,
  onUseSaved,
  onDeleteSaved,
}: SignatureCaptureModalProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [color, setColor] = useState<string>(INK_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTHS[1]);
  const [strokes, setStrokes] = useState(0);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    padRef.current?.clear();
    setStrokes(0);
    setError(null);
  }, []);

  const done = useCallback(async () => {
    if (!padRef.current || padRef.current.isEmpty() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const captured = await padRef.current.capture();
      onCapture(captured, remember);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That signature could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, remember, reset]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView style={styles.sheetSafe} edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.titleRow}>
            <Text style={typography.titleLg}>Your signature</Text>
            <Pressable
              onPress={onClose}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {saved.length ? (
            <>
              <Text style={[typography.labelMd, styles.savedLabel]}>Use a saved signature</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.savedRow}
              >
                {saved.map((sig) => (
                  <Pressable
                    key={sig.id}
                    onPress={() => onUseSaved(sig)}
                    onLongPress={() => onDeleteSaved(sig.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Use this saved signature"
                    accessibilityHint="Touch and hold to delete it"
                    style={({ pressed }) => [styles.savedTile, pressed && styles.pressed]}
                  >
                    <Image
                      source={{ uri: `data:image/png;base64,${sig.pngBase64}` }}
                      style={styles.savedImage}
                      resizeMode="contain"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <SignaturePad
            ref={padRef}
            color={color}
            strokeWidth={strokeWidth}
            onStrokeCountChange={setStrokes}
            height={190}
          />

          <View style={styles.toolRow}>
            <View style={styles.inkRow}>
              {INK_COLORS.map((ink) => {
                const active = ink.value === color;
                return (
                  <Pressable
                    key={ink.value}
                    onPress={() => setColor(ink.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={ink.label}
                    style={[styles.ink, active && styles.inkActive]}
                  >
                    <View style={[styles.inkDot, { backgroundColor: ink.value }]} />
                  </Pressable>
                );
              })}

              <View style={styles.divider} />

              {STROKE_WIDTHS.map((width) => {
                const active = width === strokeWidth;
                return (
                  <Pressable
                    key={width}
                    onPress={() => setStrokeWidth(width)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Stroke width ${width}`}
                    style={[styles.ink, active && styles.inkActive]}
                  >
                    <View
                      style={{
                        width: 20,
                        height: width,
                        borderRadius: radius.full,
                        backgroundColor: colors.onSurface,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.inkRow}>
              <Pressable
                onPress={() => padRef.current?.undo()}
                disabled={!strokes}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Undo last stroke"
                style={[styles.ink, !strokes && styles.disabled]}
              >
                <MaterialCommunityIcons name="undo" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable
                onPress={reset}
                disabled={!strokes}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Clear signature"
                style={[styles.ink, !strokes && styles.disabled]}
              >
                <MaterialCommunityIcons
                  name="eraser-variant"
                  size={20}
                  color={colors.onSurfaceVariant}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => setRemember((v) => !v)}
            style={styles.rememberRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remember }}
          >
            <View style={[styles.checkbox, remember && styles.checkboxOn]}>
              {remember ? (
                <MaterialCommunityIcons name="check" size={14} color={colors.onPrimary} />
              ) : null}
            </View>
            <Text style={[typography.bodyMd, styles.rememberText]}>
              Remember this signature on this device
            </Text>
          </Pressable>

          {error ? (
            <Text style={[typography.labelMd, styles.error]}>{error}</Text>
          ) : null}

          <Button
            label="Use this signature"
            icon="check"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!strokes || busy}
            onPress={done}
            style={styles.cta}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheetSafe: { backgroundColor: colors.surfaceLowest },
  sheet: {
    backgroundColor: colors.surfaceLowest,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    ...elevation.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.outlineVariant,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },

  savedLabel: { marginBottom: spacing.sm },
  savedRow: { gap: spacing.sm, paddingBottom: spacing.md },
  savedTile: {
    width: 108,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
    padding: spacing.xs,
  },
  savedImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.8 },

  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  inkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ink: {
    width: MIN_TOUCH - 8,
    height: MIN_TOUCH - 8,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.transparent,
  },
  inkActive: { borderColor: colors.primaryContainer, backgroundColor: colors.primaryFixed },
  inkDot: { width: 22, height: 22, borderRadius: radius.full },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: spacing.xs,
  },
  disabled: { opacity: 0.35 },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: MIN_TOUCH - 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm + 2,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  rememberText: { flex: 1 },

  error: { color: colors.error, marginTop: spacing.sm },
  cta: { marginTop: spacing.sm },
});

export default SignatureCaptureModal;
