import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Badge,
  BottomActionBar,
  Button,
  Card,
  Header,
  ProgressBar,
  ResultSheet,
} from '../components/common';
import AdContainer from '../components/ads/AdContainer';
import { colors, radius, spacing, toolAccents, typography } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import useDocumentProcessor from '../hooks/useDocumentProcessor';
import {
  compressPdf,
  estimateCompression,
  getPageCount,
  type CompressionLevel,
} from '../services/pdfService';
import {
  fileSize,
  formatBytes,
  formatDocumentMeta,
  generateId,
  listDocumentsPruned,
  type DocumentMeta,
} from '../services/storageService';

type Props = NativeStackScreenProps<RootStackParamList, 'Compress'>;

const LEVELS: { value: CompressionLevel; title: string; caption: string }[] = [
  { value: 'low', title: 'Low', caption: 'Best quality' },
  { value: 'medium', title: 'Medium', caption: 'Recommended' },
  { value: 'high', title: 'High', caption: 'Maximum shrink' },
];

/**
 * Stitch Screen 5. The honest part of this screen is the estimate: for PDFs this
 * app made we can genuinely re-encode the page images, and for imported files we
 * can only re-pack the structure. The UI says which one you are getting before
 * you press the button rather than after.
 */
export function CompressScreen({ navigation, route }: Props) {
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [recents, setRecents] = useState<DocumentMeta[]>([]);
  const [level, setLevel] = useState<CompressionLevel>('medium');
  const [result, setResult] = useState<DocumentMeta | null>(null);

  const { busy, progress, status, error, run, clearError } = useDocumentProcessor();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const docs = await listDocumentsPruned().catch(() => [] as DocumentMeta[]);
      if (!alive) return;
      setRecents(docs);
      const wanted = route.params?.documentId;
      if (wanted) {
        const found = docs.find((d) => d.id === wanted);
        if (found) setDoc(found);
      }
    })();
    return () => {
      alive = false;
    };
  }, [route.params?.documentId]);

  const browse = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    try {
      const [size, pageCount] = await Promise.all([
        asset.size ? Promise.resolve(asset.size) : fileSize(asset.uri),
        getPageCount(asset.uri),
      ]);
      // Not persisted — an imported file is only a compression input until the
      // compressed copy is saved.
      setDoc({
        id: generateId(),
        name: asset.name ?? 'Document.pdf',
        uri: asset.uri,
        size,
        pageCount,
        kind: 'imported',
        createdAt: new Date().toISOString(),
      });
      setResult(null);
      clearError();
    } catch (err) {
      Alert.alert(
        'Could not read that PDF',
        err instanceof Error ? err.message : 'The file may be damaged or password protected.'
      );
    }
  }, [clearError]);

  const estimates = useMemo(() => (doc ? estimateCompression(doc) : []), [doc]);
  const current = estimates.find((e) => e.level === level);
  const canReencode = Boolean(doc?.sourceImageUris?.length);

  const compress = useCallback(async () => {
    if (!doc) return;
    const out = await run<DocumentMeta>((report) => compressPdf(doc, level, report), {
      initialStatus: 'Opening the document…',
    });
    if (out) setResult(out);
  }, [doc, level, run]);

  // ---- picker ---------------------------------------------------------------

  if (!doc) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Header title="Compress PDF" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            onPress={browse}
            accessibilityRole="button"
            accessibilityLabel="Browse for a PDF"
            style={({ pressed }) => [styles.dropCard, pressed && styles.pressed]}
          >
            <View style={styles.dropIcon}>
              <MaterialCommunityIcons
                name="arrow-collapse-vertical"
                size={30}
                color={toolAccents.compress.fg}
              />
            </View>
            <Text style={[typography.titleMd, styles.dropTitle]}>Choose a PDF to shrink</Text>
            <Text style={[typography.bodyMd, styles.dropBody]}>
              Browse your phone, or pick one of your recent documents below.
            </Text>
          </Pressable>

          {recents.length ? (
            <>
              <Text style={[typography.titleMd, styles.sectionLabel]}>Recent documents</Text>
              {recents.map((item) => (
                <Card
                  key={item.id}
                  style={styles.recentRow}
                  padded={false}
                  onPress={() => setDoc(item)}
                  accessibilityLabel={item.name}
                >
                  <View style={styles.recentInner}>
                    <View style={styles.recentThumb}>
                      <MaterialCommunityIcons
                        name="file-pdf-box"
                        size={22}
                        color={toolAccents.pdf.fg}
                      />
                    </View>
                    <View style={styles.recentText}>
                      <Text style={[typography.titleMd, styles.recentName]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={typography.labelMd}>{formatDocumentMeta(item)}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.outline} />
                  </View>
                </Card>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- compressor -----------------------------------------------------------

  const savedPct = current ? Math.round(current.savingsRatio * 100) : 0;
  const barRatio = current ? current.estimatedBytes / Math.max(1, doc.size) : 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header
        title="Compress PDF"
        subtitle={doc.name}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => setDoc(null)} accessibilityLabel="Choose a different file">
            <MaterialCommunityIcons name="swap-horizontal" size={22} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Size breakdown */}
        <Card style={styles.sizeCard}>
          <View style={styles.sizeRow}>
            <View style={styles.sizeCol}>
              <Text style={typography.labelMd}>Original</Text>
              <Text style={typography.headlineMd}>{formatBytes(doc.size)}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={22} color={colors.outline} />
            <View style={[styles.sizeCol, styles.sizeColRight]}>
              <Text style={typography.labelMd}>Estimated output</Text>
              <Text style={[typography.headlineMd, styles.estimate]}>
                {current ? formatBytes(current.estimatedBytes) : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, barRatio * 100)}%` }]} />
          </View>

          <View style={styles.sizeFooter}>
            <Badge
              label={`About ${savedPct}% smaller`}
              tone={savedPct >= 40 ? 'success' : savedPct >= 15 ? 'primary' : 'neutral'}
              icon="arrow-collapse-vertical"
            />
            <Text style={typography.labelMd}>
              {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
            </Text>
          </View>
        </Card>

        {!canReencode ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={colors.onTertiaryFixedVariant}
            />
            <Text style={[typography.bodyMd, styles.noticeText]}>
              This PDF came from another app, so DocAssistant can only re-pack its structure — expect
              a small saving. Files made here (scans, photo PDFs) shrink far more because the
              original page images are still available.
            </Text>
          </View>
        ) : null}

        {/* Level selector */}
        <Text style={[typography.titleMd, styles.sectionLabel]}>Compression level</Text>
        <View style={styles.levels}>
          {LEVELS.map((item) => {
            const estimate = estimates.find((e) => e.level === item.value);
            const active = item.value === level;
            return (
              <Pressable
                key={item.value}
                onPress={() => setLevel(item.value)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.title}, ${item.caption}`}
                style={[styles.level, active && styles.levelActive]}
              >
                <View style={[styles.levelDot, active && styles.levelDotActive]}>
                  {active ? (
                    <MaterialCommunityIcons name="check" size={13} color={colors.onPrimary} />
                  ) : null}
                </View>
                <Text style={[typography.titleMd, styles.levelTitle]}>{item.title}</Text>
                <Text style={[typography.labelMd, styles.levelCaption]}>{item.caption}</Text>
                <Text style={[typography.labelSm, active && styles.levelSizeActive]}>
                  {estimate ? formatBytes(estimate.estimatedBytes) : '—'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {busy ? (
          <View style={styles.progressWrap}>
            <ProgressBar value={progress} label="Compressing" status={status} />
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

        <AdContainer unit="resultBanner" />
      </ScrollView>

      <BottomActionBar caption="The original file is kept — a smaller copy is saved alongside it.">
        <Button
          label="Compress & save"
          icon="arrow-collapse-vertical"
          size="lg"
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={compress}
        />
      </BottomActionBar>

      <ResultSheet
        visible={Boolean(result)}
        doc={result}
        title="Compressed"
        note="The original is untouched. Both files are on this device only."
        onClose={() => setResult(null)}
        onDone={() => {
          const id = result?.id;
          setResult(null);
          navigation.navigate('Home', { highlightDocumentId: id });
        }}
      >
        {result ? (
          <View style={styles.resultRow}>
            <Text style={typography.labelMd}>{formatBytes(doc.size)}</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={colors.outline} />
            <Text style={[typography.titleMd, styles.resultSize]}>{formatBytes(result.size)}</Text>
            <Badge
              label={`${Math.max(0, Math.round((1 - result.size / Math.max(1, doc.size)) * 100))}% smaller`}
              tone="success"
            />
          </View>
        ) : null}
      </ResultSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },

  dropCard: {
    borderRadius: radius.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
    padding: spacing.lg,
    alignItems: 'center',
  },
  pressed: { opacity: 0.9 },
  dropIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: toolAccents.compress.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dropTitle: { marginBottom: spacing.xs },
  dropBody: { textAlign: 'center' },

  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm + 4 },
  recentRow: { marginBottom: spacing.sm + 4 },
  recentInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 4 },
  recentThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: toolAccents.pdf.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { flex: 1, marginHorizontal: spacing.sm + 4 },
  recentName: { fontSize: 15 },

  sizeCard: { marginTop: spacing.xs },
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sizeCol: { flex: 1 },
  sizeColRight: { alignItems: 'flex-end' },
  estimate: { color: colors.secondary },
  barTrack: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.secondaryContainer },
  sizeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },

  noticeCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.tertiaryFixed,
  },
  noticeText: { flex: 1, color: colors.onTertiaryFixedVariant },

  levels: { flexDirection: 'row', gap: spacing.sm },
  level: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  levelActive: { borderWidth: 2, borderColor: colors.primaryContainer, backgroundColor: colors.primaryFixed },
  levelDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  levelDotActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  levelTitle: { fontSize: 15 },
  levelCaption: { textAlign: 'center' },
  levelSizeActive: { color: colors.onPrimaryFixedVariant, fontWeight: '700' },

  progressWrap: { marginTop: spacing.lg },
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

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  resultSize: { color: colors.secondary },
});

export default CompressScreen;
