import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Badge, BottomActionBar, Button, Header, ProgressBar } from '../components/common';
import AdContainer from '../components/ads/AdContainer';
import { FilteredImage, useFilterBaker } from '../components/scanner/FilterCanvas';
import FilterToggle from '../components/scanner/FilterToggle';
import CropOverlay from '../components/scanner/CropOverlay';
import PageThumbnail, {
  AddPageTile,
  THUMB_WIDTH,
} from '../components/scanner/PageThumbnail';
import type { ScanFilter } from '../components/scanner/imageFilters';
import { colors, radius, spacing, typography, HIT_SLOP } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import useDocumentProcessor from '../hooks/useDocumentProcessor';
import {
  createFromImages,
  qualityLabel,
  sharePdf,
  type PageSizeMode,
  type PdfQuality,
} from '../services/pdfService';
import type { DocumentMeta } from '../services/storageService';

type Props = NativeStackScreenProps<RootStackParamList, 'ImgToPdf'>;

const QUALITIES: { value: PdfQuality; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
];

const STEP = THUMB_WIDTH + spacing.sm;

/**
 * One image waiting on the crop modal. Pages are added to the list *before*
 * they are offered a crop, so `replaceIndex` always points at a real page and
 * skipping the crop simply leaves the original in place.
 */
interface CropTask {
  uri: string;
  replaceIndex: number;
  /** We opened this one on the user's behalf, so leaving it keeps the original. */
  auto?: boolean;
}

/**
 * Positions of the not-yet-cropped arrivals inside the full page list. Walking
 * the list (rather than `indexOf`) keeps duplicates — the same photo picked
 * twice — pointing at their own page.
 */
function buildCropTasks(allUris?: string[], uncropped?: string[]): CropTask[] {
  if (!allUris?.length || !uncropped?.length) return [];
  const pending = new Set(uncropped);
  return allUris.reduce<CropTask[]>((acc, uri, i) => {
    if (pending.has(uri)) acc.push({ uri, replaceIndex: i, auto: true });
    return acc;
  }, []);
}

function defaultFileName(prefix: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}

/**
 * The studio from Stitch Screen 2: preview, per-page edits, the reorderable
 * carousel, and the export bar. The camera lives in ScannerScreen; both feed
 * pages into here.
 */
export function ImgToPdfScreen({ navigation, route }: Props) {
  const sourceTitle = route.params?.title ?? 'Images to PDF';

  const [pages, setPages] = useState<string[]>(route.params?.initialUris ?? []);
  const [filters, setFilters] = useState<ScanFilter[]>(
    () => (route.params?.initialUris ?? []).map(() => (sourceTitle === 'Scan' ? 'document' : 'original'))
  );
  const [selected, setSelected] = useState(0);
  const [fileName, setFileName] = useState(() => defaultFileName(sourceTitle === 'Scan' ? 'Scan' : 'Document'));
  const [quality, setQuality] = useState<PdfQuality>('balanced');
  const [pageSize, setPageSize] = useState<PageSizeMode>('a4');

  // One queue drives every crop: the toolbar's "Crop" on the current page, and
  // the automatic offer made to each image the moment it is imported.
  const [cropQueue, setCropQueue] = useState<CropTask[]>(() =>
    buildCropTasks(route.params?.initialUris, route.params?.cropUris)
  );
  const [queueTotal, setQueueTotal] = useState(cropQueue.length);

  const { busy, progress, status, error, run, clearError } = useDocumentProcessor();
  const { apply: bakeFilter, node: bakerNode } = useFilterBaker();

  // The scanner hands pages back by navigating here with new params. It is
  // seeded with the pages we already have, so the incoming list is the whole
  // truth — but the filters already chosen for the leading pages are kept.
  const appliedParamsRef = useRef(route.params?.initialUris);
  useEffect(() => {
    const incoming = route.params?.initialUris;
    if (!incoming || incoming === appliedParamsRef.current) return;
    appliedParamsRef.current = incoming;
    setPages(incoming);
    setFilters((prev) =>
      incoming.map((_, i) => prev[i] ?? (sourceTitle === 'Scan' ? 'document' : 'original'))
    );
    setSelected(Math.max(0, incoming.length - 1));

    // Images that arrived without passing a crop step yet get offered one here.
    const tasks = buildCropTasks(incoming, route.params?.cropUris);
    if (tasks.length) {
      setCropQueue(tasks);
      setQueueTotal(tasks.length);
    }
  }, [route.params?.cropUris, route.params?.initialUris, sourceTitle]);

  const index = Math.min(selected, Math.max(0, pages.length - 1));
  const currentUri = pages[index];
  const currentFilter = filters[index] ?? 'original';

  // ---- page mutations -------------------------------------------------------

  const replacePage = useCallback((at: number, uri: string) => {
    setPages((prev) => prev.map((u, i) => (i === at ? uri : u)));
  }, []);

  const addPages = useCallback(
    (uris: string[], filter: ScanFilter = 'original') => {
      if (!uris.length) return;
      setPages((prev) => [...prev, ...uris]);
      setFilters((prev) => [...prev, ...uris.map(() => filter)]);
    },
    []
  );

  const deletePage = useCallback((at: number) => {
    setPages((prev) => prev.filter((_, i) => i !== at));
    setFilters((prev) => prev.filter((_, i) => i !== at));
    setSelected((prev) => (prev >= at && prev > 0 ? prev - 1 : prev));
  }, []);

  const movePage = useCallback((from: number, to: number) => {
    if (from === to) return;
    const reorder = <T,>(arr: T[]) => {
      const next = arr.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    };
    setPages((prev) => reorder(prev));
    setFilters((prev) => reorder(prev));
    setSelected(to);
  }, []);

  const setCurrentFilter = useCallback(
    (next: ScanFilter) => setFilters((prev) => prev.map((f, i) => (i === index ? next : f))),
    [index]
  );

  const applyFilterToAll = useCallback(
    () => setFilters((prev) => prev.map(() => currentFilter)),
    [currentFilter]
  );

  const rotateCurrent = useCallback(async () => {
    if (!currentUri) return;
    try {
      const result = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ rotate: 90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      replacePage(index, result.uri);
    } catch {
      Alert.alert('Could not rotate', 'That page could not be rotated. Please try again.');
    }
  }, [currentUri, index, replacePage]);

  const pickMore = useCallback(async () => {
    const granted = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to add more pages. Nothing is uploaded.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      orderedSelection: true,
    });
    if (result.canceled || !result.assets.length) return;

    const uris = result.assets.map((a) => a.uri);
    const base = pages.length;
    addPages(uris);
    setCropQueue(uris.map((uri, i) => ({ uri, replaceIndex: base + i, auto: true })));
    setQueueTotal(uris.length);
  }, [addPages, pages.length]);

  // ---- crop queue -----------------------------------------------------------

  const cropTask = cropQueue[0] ?? null;

  const nextCrop = useCallback(() => setCropQueue((prev) => prev.slice(1)), []);

  const onCropped = useCallback(
    (uri: string) => {
      if (cropTask) {
        replacePage(cropTask.replaceIndex, uri);
        setSelected(cropTask.replaceIndex);
      }
      nextCrop();
    },
    [cropTask, nextCrop, replacePage]
  );

  const cropCurrentPage = useCallback(() => {
    if (!currentUri) return;
    setCropQueue([{ uri: currentUri, replaceIndex: index }]);
    setQueueTotal(1);
  }, [currentUri, index]);

  // ---- export ---------------------------------------------------------------

  const onExport = useCallback(async () => {
    const name = fileName.trim() || defaultFileName('Document');

    const doc = await run<DocumentMeta>(
      async (report) => {
        // Bake every non-original filter first so the PDF matches the preview
        // pixel for pixel.
        const baked: string[] = [];
        for (let i = 0; i < pages.length; i += 1) {
          report({
            value: (i / pages.length) * 0.25,
            status: `Applying filters — page ${i + 1} of ${pages.length}`,
          });
          baked.push(await bakeFilter(pages[i], filters[i] ?? 'original'));
        }

        return createFromImages(baked, {
          fileName: name,
          quality,
          pageSize,
          onProgress: ({ value, status: line }) =>
            report({ value: 0.25 + value * 0.75, status: line }),
        });
      },
      { initialStatus: 'Preparing pages…' }
    );

    if (!doc) return;

    Alert.alert('PDF saved', `“${doc.name}” is ready on this device.`, [
      { text: 'Share', onPress: () => void sharePdf(doc.uri, doc.name) },
      {
        text: 'Sign it',
        onPress: () => navigation.replace('Sign', { documentId: doc.id }),
      },
      {
        text: 'Done',
        style: 'cancel',
        onPress: () => navigation.navigate('Home', { highlightDocumentId: doc.id }),
      },
    ]);
  }, [bakeFilter, fileName, filters, navigation, pageSize, pages, quality, run]);

  // ---- render ---------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header
        title={sourceTitle === 'Scan' ? 'Scan studio' : 'Images to PDF'}
        subtitle={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · stays on this device`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={pickMore} hitSlop={HIT_SLOP} accessibilityLabel="Add pages">
            <MaterialCommunityIcons name="plus" size={24} color={colors.primary} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Preview */}
          <View style={styles.preview}>
            {currentUri ? (
              <FilteredImage
                uri={currentUri}
                filter={currentFilter}
                width="100%"
                height="100%"
                borderRadius={radius.lg}
              />
            ) : (
              <View style={styles.emptyPreview}>
                <MaterialCommunityIcons
                  name="image-plus"
                  size={30}
                  color={colors.outline}
                />
                <Text style={[typography.bodyMd, styles.emptyText]}>
                  No pages yet — add photos or scan a page.
                </Text>
                <Button label="Add photos" variant="secondary" icon="image-multiple-outline" onPress={pickMore} />
              </View>
            )}
            {pages.length > 0 ? (
              <View style={styles.pagePill}>
                <Text style={[typography.labelSm, styles.pagePillText]}>
                  {index + 1} / {pages.length}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Filters + per-page edits */}
          {pages.length > 0 ? (
            <>
              <View style={styles.filterRow}>
                <FilterToggle
                  value={currentFilter}
                  onChange={setCurrentFilter}
                  onCrop={cropCurrentPage}
                  onRotate={rotateCurrent}
                  disabled={busy}
                />
              </View>
              {pages.length > 1 ? (
                <Pressable onPress={applyFilterToAll} hitSlop={HIT_SLOP} style={styles.applyAll}>
                  <MaterialCommunityIcons
                    name="checkbox-multiple-marked-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text style={[typography.labelMd, styles.applyAllText]}>
                    Apply this filter to all pages
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {/* Carousel */}
          <ReorderStrip
            pages={pages}
            filters={filters}
            selected={index}
            disabled={busy}
            onSelect={setSelected}
            onDelete={deletePage}
            onMove={movePage}
            onAdd={() => navigation.navigate('Scanner', { existingUris: pages })}
          />

          {/* Export settings */}
          <Text style={[typography.titleMd, styles.sectionLabel]}>File name</Text>
          <View style={styles.nameField}>
            <TextInput
              value={fileName}
              onChangeText={setFileName}
              placeholder="Document name"
              placeholderTextColor={colors.outline}
              style={[typography.bodyLg, styles.nameInput]}
              editable={!busy}
              returnKeyType="done"
              accessibilityLabel="File name"
            />
            <Text style={[typography.labelMd, styles.suffix]}>.pdf</Text>
          </View>

          <Text style={[typography.titleMd, styles.sectionLabel]}>Quality</Text>
          <View style={styles.segment}>
            {QUALITIES.map((q) => {
              const active = q.value === quality;
              return (
                <Pressable
                  key={q.value}
                  onPress={() => setQuality(q.value)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text
                    style={[
                      typography.labelMd,
                      styles.segmentLabel,
                      active && styles.segmentLabelActive,
                    ]}
                  >
                    {q.label}
                  </Text>
                  <Text
                    style={[
                      typography.labelSm,
                      styles.segmentHint,
                      active && styles.segmentHintActive,
                    ]}
                  >
                    {qualityLabel(q.value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setPageSize((p) => (p === 'a4' ? 'fit' : 'a4'))}
            disabled={busy}
            style={styles.switchRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: pageSize === 'a4' }}
          >
            <MaterialCommunityIcons
              name={pageSize === 'a4' ? 'file-document-outline' : 'image-outline'}
              size={20}
              color={colors.onSurfaceVariant}
            />
            <View style={styles.switchText}>
              <Text style={typography.titleMd}>
                {pageSize === 'a4' ? 'Fit pages to A4' : 'Match the photo shape'}
              </Text>
              <Text style={typography.labelMd}>
                {pageSize === 'a4'
                  ? 'Best for printing and sharing'
                  : 'Every page keeps its original proportions'}
              </Text>
            </View>
            <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.primary} />
          </Pressable>

          {busy ? (
            <View style={styles.progressWrap}>
              <ProgressBar value={progress} label="Building your PDF" status={status} />
            </View>
          ) : null}

          {error ? (
            <Pressable onPress={clearError} style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.onErrorContainer} />
              <Text style={[typography.bodyMd, styles.errorText]}>{error}</Text>
            </Pressable>
          ) : null}

          <AdContainer unit="resultBanner" />
        </ScrollView>

        <BottomActionBar caption="Saved to this device only — nothing is uploaded.">
          <Button
            label={pages.length ? `Export PDF · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}` : 'Export PDF'}
            icon="file-pdf-box"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!pages.length || busy}
            onPress={onExport}
          />
        </BottomActionBar>
      </KeyboardAvoidingView>

      <CropOverlay
        visible={cropTask !== null}
        uri={cropTask?.uri ?? null}
        title={cropTask?.auto ? 'Crop this page' : 'Crop page'}
        skipLabel={cropTask?.auto ? 'Use as is' : 'Cancel'}
        counter={queueTotal > 1 ? `${queueTotal - cropQueue.length + 1} of ${queueTotal}` : undefined}
        onCancel={nextCrop}
        onCropped={onCropped}
        onSkipAll={cropQueue.length > 1 ? () => setCropQueue([]) : undefined}
      />

      {/* Off-screen surface the filter baker renders into. */}
      {bakerNode}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

/**
 * Horizontal page strip with long-press-to-drag reordering.
 *
 * One PanResponder lives on the strip and only claims the gesture once a
 * thumbnail has been picked up by a long press; scrolling is disabled for the
 * duration so the ScrollView and the drag never fight over the touch.
 */
function ReorderStrip({
  pages,
  filters,
  selected,
  disabled,
  onSelect,
  onDelete,
  onMove,
  onAdd,
}: {
  pages: string[];
  filters: ScanFilter[];
  selected: number;
  disabled?: boolean;
  onSelect: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const draggingRef = useRef<number | null>(null);
  const translate = useRef(new Animated.Value(0)).current;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: () => draggingRef.current !== null,
        onPanResponderMove: (_evt, g) => translate.setValue(g.dx),
        onPanResponderRelease: (_evt, g) => {
          const from = draggingRef.current;
          translate.setValue(0);
          draggingRef.current = null;
          setDragging(null);
          if (from === null) return;
          const shift = Math.round(g.dx / STEP);
          const to = Math.min(pagesRef.current.length - 1, Math.max(0, from + shift));
          onMove(from, to);
        },
        onPanResponderTerminate: () => {
          translate.setValue(0);
          draggingRef.current = null;
          setDragging(null);
        },
      }),
    [onMove, translate]
  );

  if (!pages.length) return null;

  return (
    <View style={styles.stripWrap}>
      <View style={styles.stripHeader}>
        <Text style={typography.titleMd}>Pages</Text>
        <Badge
          label={dragging === null ? 'Hold a page to reorder' : 'Drag to a new spot'}
          tone={dragging === null ? 'neutral' : 'primary'}
          icon={dragging === null ? 'gesture-tap-hold' : 'arrow-left-right'}
        />
      </View>

      <ScrollView
        horizontal
        scrollEnabled={dragging === null}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        <View style={styles.stripInner} {...responder.panHandlers}>
          {pages.map((uri, i) => {
            const isDragging = dragging === i;
            const content = (
              <PageThumbnail
                uri={uri}
                index={i}
                filter={filters[i] ?? 'original'}
                selected={i === selected}
                dragging={isDragging}
                onPress={() => onSelect(i)}
                onDelete={() => onDelete(i)}
                onLongPress={() => {
                  if (disabled || pages.length < 2) return;
                  draggingRef.current = i;
                  setDragging(i);
                  onSelect(i);
                }}
              />
            );

            return isDragging ? (
              <Animated.View
                key={`${uri}-${i}`}
                style={[styles.stripCell, { transform: [{ translateX: translate }], zIndex: 10 }]}
              >
                {content}
              </Animated.View>
            ) : (
              <View key={`${uri}-${i}`} style={styles.stripCell}>
                {content}
              </View>
            );
          })}
          <View style={styles.stripCell}>
            <AddPageTile onPress={onAdd} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingBottom: spacing.lg },

  preview: {
    height: 300,
    marginHorizontal: spacing.gutter,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPreview: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyText: { textAlign: 'center' },
  pagePill: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  pagePillText: { color: colors.onPrimary, fontWeight: '700' },

  filterRow: { marginTop: spacing.md },
  applyAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.gutter,
    minHeight: 32,
  },
  applyAllText: { color: colors.primary, fontWeight: '600' },

  stripWrap: { marginTop: spacing.lg },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    marginBottom: spacing.sm + 4,
  },
  strip: { paddingHorizontal: spacing.gutter },
  stripInner: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  stripCell: { width: THUMB_WIDTH },

  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.gutter,
  },
  nameField: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.gutter,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  nameInput: { flex: 1, paddingVertical: spacing.md },
  suffix: { marginLeft: spacing.sm },

  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.gutter,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.full,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  segmentItemActive: { backgroundColor: colors.primaryContainer },
  segmentLabel: { color: colors.onSurfaceVariant, fontWeight: '700' },
  segmentLabelActive: { color: colors.onPrimary },
  segmentHint: { color: colors.outline },
  segmentHintActive: { color: 'rgba(255,255,255,0.85)' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginHorizontal: spacing.gutter,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  switchText: { flex: 1 },

  progressWrap: { marginHorizontal: spacing.gutter, marginTop: spacing.lg },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.gutter,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorContainer,
  },
  errorText: { flex: 1, color: colors.onErrorContainer },
});

export default ImgToPdfScreen;
