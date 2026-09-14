import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, elevation, radius, spacing, typography, toolAccents } from '../../constants/theme';
import { Button } from './Button';
import { printPdf, sharePdf } from '../../services/pdfService';
import { formatDocumentMeta, type DocumentMeta } from '../../services/storageService';

export interface ResultSheetProps {
  visible: boolean;
  doc: DocumentMeta | null;
  /** Headline, e.g. "Converted" or "Compressed". */
  title?: string;
  /** One reassuring line under the file card. */
  note?: string;
  /** Slot for tool-specific detail, e.g. the before/after size bar. */
  children?: React.ReactNode;
  onSign?: () => void;
  onClose: () => void;
  onDone: () => void;
}

/**
 * The shared "your file is ready" sheet: preview, share, optional sign, done.
 * Preview goes through the Android print dialog — the only renderer for a real
 * PDF that Expo Go gives us.
 */
export function ResultSheet({
  visible,
  doc,
  title = 'Your PDF is ready',
  note = 'Saved on this device. Nothing was uploaded.',
  children,
  onSign,
  onClose,
  onDone,
}: ResultSheetProps) {
  const [working, setWorking] = useState<'share' | 'preview' | null>(null);

  const guard = async (kind: 'share' | 'preview', fn: () => Promise<void>) => {
    if (!doc || working) return;
    setWorking(kind);
    try {
      await fn();
    } catch {
      // The user cancelling the system sheet lands here too — nothing to say.
    } finally {
      setWorking(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView style={styles.sheetSafe} edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.successRow}>
            <View style={styles.successIcon}>
              <MaterialCommunityIcons name="check" size={20} color={colors.onSecondaryContainer} />
            </View>
            <Text style={typography.titleLg}>{title}</Text>
          </View>

          {doc ? (
            <View style={styles.fileCard}>
              <View style={styles.thumb}>
                <MaterialCommunityIcons name="file-pdf-box" size={26} color={toolAccents.pdf.fg} />
              </View>
              <View style={styles.fileText}>
                <Text style={[typography.titleMd, styles.fileName]} numberOfLines={2}>
                  {doc.name}
                </Text>
                <Text style={typography.labelMd}>{formatDocumentMeta(doc)}</Text>
              </View>
            </View>
          ) : null}

          {children}

          <Text style={[typography.labelMd, styles.note]}>{note}</Text>

          <View style={styles.actions}>
            <Button
              label="Preview"
              icon="file-eye-outline"
              variant="secondary"
              style={styles.half}
              loading={working === 'preview'}
              onPress={() => guard('preview', () => printPdf(doc!.uri))}
            />
            <Button
              label="Share"
              icon="share-variant-outline"
              style={styles.half}
              loading={working === 'share'}
              onPress={() => guard('share', () => sharePdf(doc!.uri, doc!.name))}
            />
          </View>

          {onSign ? (
            <Button
              label="Add a signature"
              icon="draw-pen"
              variant="secondary"
              fullWidth
              onPress={onSign}
              style={styles.stacked}
            />
          ) : null}

          <Button label="Done" variant="ghost" fullWidth onPress={onDone} />
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
    marginBottom: spacing.md,
  },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  successIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.secondaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginTop: spacing.md,
    padding: spacing.sm + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLow,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: toolAccents.pdf.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1 },
  fileName: { fontSize: 15 },
  note: { marginTop: spacing.md, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  half: { flex: 1 },
  stacked: { marginTop: spacing.sm },
});

export default ResultSheet;
