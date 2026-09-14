import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Badge,
  BottomActionBar,
  Button,
  Header,
  OfflineBadge,
  ProgressBar,
  ResultSheet,
} from '../components/common';
import AdContainer from '../components/ads/AdContainer';
import { colors, radius, spacing, toolAccents, typography } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import useDocumentProcessor from '../hooks/useDocumentProcessor';
import { wordToPdf } from '../services/pdfService';
import { formatBytes, type DocumentMeta } from '../services/storageService';

type Props = NativeStackScreenProps<RootStackParamList, 'WordToPdf'>;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PickedFile {
  uri: string;
  name: string;
  size: number;
}

/**
 * Stitch Screen 3. One file in, one PDF out, with the conversion visible the
 * whole way. Conversion is mammoth (.docx -> HTML) piped into expo-print, which
 * is the only text renderer available inside Expo Go.
 */
export function WordToPdfScreen({ navigation }: Props) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [result, setResult] = useState<DocumentMeta | null>(null);
  const { busy, progress, status, error, run, clearError, reset } = useDocumentProcessor();

  const browse = useCallback(async () => {
    clearError();
    const picked = await DocumentPicker.getDocumentAsync({
      type: [DOCX_MIME],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    if (!/\.docx$/i.test(asset.name ?? '')) {
      Alert.alert(
        'Only .docx works',
        'This tool reads the modern Word format (.docx). Older .doc files and Pages files are not supported — open it in Word and “Save as .docx” first.'
      );
      return;
    }

    setResult(null);
    reset();
    setFile({ uri: asset.uri, name: asset.name ?? 'Document.docx', size: asset.size ?? 0 });
  }, [clearError, reset]);

  const convert = useCallback(async () => {
    if (!file) return;
    const doc = await run<DocumentMeta>(
      (report) =>
        wordToPdf(file.uri, {
          fileName: file.name.replace(/\.docx$/i, ''),
          onProgress: report,
        }),
      { initialStatus: 'Reading the document…' }
    );
    if (doc) setResult(doc);
  }, [file, run]);

  const done = useCallback(() => {
    setResult(null);
    navigation.navigate('Home', { highlightDocumentId: result?.id });
  }, [navigation, result]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header
        title="Word to PDF"
        subtitle="Converted on your phone"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OfflineBadge style={styles.offline} />

        {/* Drop / browse card */}
        <Pressable
          onPress={busy ? undefined : browse}
          accessibilityRole="button"
          accessibilityLabel={file ? `Selected ${file.name}. Tap to choose a different file.` : 'Browse for a Word file'}
          style={({ pressed }) => [
            styles.dropCard,
            file ? styles.dropCardFilled : styles.dropCardEmpty,
            pressed && !busy && styles.pressed,
          ]}
        >
          {file ? (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <MaterialCommunityIcons
                  name="file-word-outline"
                  size={26}
                  color={toolAccents.word.fg}
                />
              </View>
              <View style={styles.fileText}>
                <Text style={[typography.titleMd, styles.fileName]} numberOfLines={2}>
                  {file.name}
                </Text>
                <Text style={typography.labelMd}>
                  {file.size ? `${formatBytes(file.size)} · ` : ''}Word document
                </Text>
              </View>
              <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.dropIcon}>
                <MaterialCommunityIcons
                  name="file-word-outline"
                  size={30}
                  color={toolAccents.word.fg}
                />
              </View>
              <Text style={[typography.titleMd, styles.dropTitle]}>Choose a Word file</Text>
              <Text style={[typography.bodyMd, styles.dropBody]}>
                Tap to browse your phone, or drop a file here from your file manager.
              </Text>
              <Badge label=".docx only" tone="neutral" icon="information-outline" style={styles.dropBadge} />
            </>
          )}
        </Pressable>

        {/* Conversion status */}
        {busy || progress === 1 ? (
          <View style={styles.progressCard}>
            <ProgressBar
              value={progress}
              label="Converting"
              status={status}
              tone={progress === 1 && !busy ? 'success' : 'progress'}
            />
            <View style={styles.steps}>
              <Step label="Read" done={progress > 0.1} active={progress <= 0.1} />
              <StepLine done={progress > 0.35} />
              <Step label="Lay out" done={progress > 0.6} active={progress > 0.1 && progress <= 0.6} />
              <StepLine done={progress > 0.75} />
              <Step label="Write PDF" done={progress >= 1} active={progress > 0.6 && progress < 1} />
            </View>
          </View>
        ) : null}

        {error ? (
          <Pressable onPress={clearError} style={styles.errorBox}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={18}
              color={colors.onErrorContainer}
            />
            <Text style={[typography.bodyMd, styles.errorText]}>{error}</Text>
          </Pressable>
        ) : null}

        {/* What to expect — set expectations rather than surprise the user. */}
        <View style={styles.infoCard}>
          <Text style={[typography.titleMd, styles.infoTitle]}>What carries over</Text>
          <InfoLine icon="check" tone="ok" text="Headings, paragraphs, bold and italic" />
          <InfoLine icon="check" tone="ok" text="Lists, tables and embedded images" />
          <InfoLine icon="check" tone="ok" text="Links and footnotes" />
          <InfoLine
            icon="minus"
            tone="muted"
            text="Exotic fonts and page-exact layout are approximated"
          />
        </View>

        <AdContainer unit="resultBanner" />
      </ScrollView>

      <BottomActionBar caption="Your file never leaves this device.">
        <Button
          label={file ? 'Convert to PDF' : 'Choose a file first'}
          icon="file-pdf-box"
          size="lg"
          fullWidth
          loading={busy}
          disabled={!file || busy}
          onPress={convert}
        />
      </BottomActionBar>

      <ResultSheet
        visible={Boolean(result)}
        doc={result}
        title="Converted"
        onSign={() => {
          const id = result?.id;
          setResult(null);
          if (id) navigation.replace('Sign', { documentId: id });
        }}
        onClose={() => setResult(null)}
        onDone={done}
      />
    </SafeAreaView>
  );
}

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <View style={styles.step}>
      <View
        style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}
      >
        {done ? <MaterialCommunityIcons name="check" size={12} color={colors.onPrimary} /> : null}
      </View>
      <Text style={[typography.labelSm, (done || active) && styles.stepLabelOn]}>{label}</Text>
    </View>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <View style={[styles.stepLine, done && styles.stepLineDone]} />;
}

function InfoLine({
  icon,
  text,
  tone,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  tone: 'ok' | 'muted';
}) {
  return (
    <View style={styles.infoLine}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={tone === 'ok' ? colors.onSecondaryContainer : colors.outline}
      />
      <Text style={[typography.bodyMd, styles.infoText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  offline: { marginBottom: spacing.md },

  dropCard: { borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center' },
  dropCardEmpty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  dropCardFilled: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceLowest,
    padding: spacing.md,
  },
  pressed: { opacity: 0.9 },
  dropIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: toolAccents.word.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dropTitle: { marginBottom: spacing.xs },
  dropBody: { textAlign: 'center' },
  dropBadge: { marginTop: spacing.md },

  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, width: '100%' },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: toolAccents.word.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1 },
  fileName: { fontSize: 15 },

  progressCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  step: { alignItems: 'center', width: 64 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepDotActive: { backgroundColor: colors.tertiaryFixed },
  stepDotDone: { backgroundColor: colors.primaryContainer },
  stepLabelOn: { color: colors.onSurface, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.surfaceHigh, marginBottom: 18 },
  stepLineDone: { backgroundColor: colors.primaryContainer },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorContainer,
  },
  errorText: { flex: 1, color: colors.onErrorContainer },

  infoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLow,
  },
  infoTitle: { marginBottom: spacing.sm },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  infoText: { flex: 1 },
});

export default WordToPdfScreen;
