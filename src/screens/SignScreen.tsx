import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BottomActionBar,
  Button,
  Card,
  Header,
  ProgressBar,
  ResultSheet,
} from '../components/common';
import AdContainer from '../components/ads/AdContainer';
import DraggableSignature, { type Rect } from '../components/signature/DraggableSignature';
import SignatureCaptureModal from '../components/signature/SignatureCaptureModal';
import type { CapturedSignature } from '../components/signature/SignaturePad';
import { colors, radius, spacing, toolAccents, typography, HIT_SLOP, MIN_TOUCH } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import useDocumentProcessor from '../hooks/useDocumentProcessor';
import {
  getPageGeometry,
  signPdf,
  type PageGeometry,
  type SignaturePlacement,
} from '../services/pdfService';
import {
  deleteSignature,
  formatDocumentMeta,
  generateId,
  listDocumentsPruned,
  listSignatures,
  saveSignature,
  type DocumentMeta,
  type SavedSignature,
} from '../services/storageService';

type Props = NativeStackScreenProps<RootStackParamList, 'Sign'>;

/** A signature dropped on a page. Geometry is normalised 0..1 of the page box. */
interface Placed {
  id: string;
  pageIndex: number;
  /** Normalised, measured from the page's top-left corner. */
  box: Rect;
  pngBase64: string;
  aspectRatio: number;
}

interface Source {
  uri: string;
  name: string;
  docId?: string;
  geometry: PageGeometry[];
  /** Page images for app-generated PDFs — lets us show the real page. */
  previewUris?: string[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Stitch Screen 4. Two states: pick a PDF, then place signatures on it.
 *
 * Honest limitation: Expo Go ships no PDF rasteriser, so the page canvas is
 * drawn to scale from the PDF's own MediaBox (via pdf-lib) and backed by the
 * real page image whenever this app generated the file. Placement coordinates
 * are normalised against that box, so what you position is exactly where the
 * signature lands in the output regardless of what the canvas shows.
 */
export function SignScreen({ navigation, route }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [recents, setRecents] = useState<DocumentMeta[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);

  const [placed, setPlaced] = useState<Placed[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const [capturing, setCapturing] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSignature[]>([]);

  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const [result, setResult] = useState<DocumentMeta | null>(null);
  const { busy, progress, status, error, run, clearError } = useDocumentProcessor();

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });

  // ---- loading --------------------------------------------------------------

  useEffect(() => {
    void listSignatures().then(setSaved).catch(() => undefined);
  }, []);

  const openDocument = useCallback(async (doc: DocumentMeta) => {
    setLoadingSource(true);
    try {
      const geometry = await getPageGeometry(doc.uri);
      setSource({
        uri: doc.uri,
        name: doc.name,
        docId: doc.id,
        geometry,
        previewUris: doc.sourceImageUris,
      });
      setPageIndex(0);
      setPlaced([]);
    } catch (err) {
      Alert.alert(
        'Could not open that PDF',
        err instanceof Error ? err.message : 'The file may be damaged or password protected.'
      );
    } finally {
      setLoadingSource(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const docs = await listDocumentsPruned().catch(() => [] as DocumentMeta[]);
      if (!alive) return;
      setRecents(docs);

      const wanted = route.params?.documentId;
      if (wanted) {
        const doc = docs.find((d) => d.id === wanted);
        if (doc) void openDocument(doc);
      }
    })();
    return () => {
      alive = false;
    };
  }, [openDocument, route.params?.documentId]);

  const browse = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    setLoadingSource(true);
    try {
      const geometry = await getPageGeometry(asset.uri);
      setSource({ uri: asset.uri, name: asset.name ?? 'Document.pdf', geometry });
      setPageIndex(0);
      setPlaced([]);
    } catch (err) {
      Alert.alert(
        'Could not open that PDF',
        err instanceof Error ? err.message : 'The file may be damaged or password protected.'
      );
    } finally {
      setLoadingSource(false);
    }
  }, []);

  // ---- page geometry --------------------------------------------------------

  /** Where the current page paints inside the stage, "contain" style. */
  const pageBox = useMemo(() => {
    const geo = source?.geometry[pageIndex];
    if (!geo || !stage.width || !stage.height) return null;
    const scale = Math.min(stage.width / geo.width, stage.height / geo.height);
    return { width: geo.width * scale, height: geo.height * scale };
  }, [source, pageIndex, stage]);

  const pageResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture for zoom/pan — a single finger at 1× must stay
        // available to the signature overlays underneath.
        onMoveShouldSetPanResponder: (evt, g) =>
          evt.nativeEvent.touches.length === 2 ||
          (zoomRef.current > 1 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)),
        onPanResponderGrant: () => {
          panStartRef.current = offsetRef.current;
          pinchRef.current = null;
        },
        onPanResponderMove: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const distance = Math.hypot(dx, dy);
            if (!pinchRef.current) {
              pinchRef.current = { distance, zoom: zoomRef.current };
              return;
            }
            const next = clamp(
              (pinchRef.current.zoom * distance) / Math.max(1, pinchRef.current.distance),
              MIN_ZOOM,
              MAX_ZOOM
            );
            setZoom(next);
            return;
          }

          pinchRef.current = null;
          const z = zoomRef.current;
          if (z <= 1 || !pageBox) return;
          const maxX = (pageBox.width * (z - 1)) / 2;
          const maxY = (pageBox.height * (z - 1)) / 2;
          setOffset({
            x: clamp(panStartRef.current.x + g.dx, -maxX, maxX),
            y: clamp(panStartRef.current.y + g.dy, -maxY, maxY),
          });
        },
        onPanResponderRelease: () => {
          pinchRef.current = null;
          if (zoomRef.current <= 1) setOffset({ x: 0, y: 0 });
        },
      }),
    [pageBox]
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // ---- placements -----------------------------------------------------------

  const addSignature = useCallback(
    (pngBase64: string, aspectRatio: number) => {
      const width = 0.42;
      const height = pageBox ? (width * pageBox.width) / aspectRatio / pageBox.height : width / aspectRatio;
      const id = generateId();

      setPlaced((prev) => {
        const next: Placed = {
          id,
          pageIndex,
          box: { x: 0.5 - width / 2, y: 0.72, width, height: Math.min(height, 0.25) },
          pngBase64,
          aspectRatio,
        };
        return replacingId ? prev.filter((p) => p.id !== replacingId).concat(next) : [...prev, next];
      });
      setSelectedId(id);
      setReplacingId(null);
    },
    [pageBox, pageIndex, replacingId]
  );

  const onCapture = useCallback(
    async (signature: CapturedSignature, remember: boolean) => {
      setCapturing(false);
      addSignature(signature.pngBase64, signature.aspectRatio);
      if (remember) {
        const next = await saveSignature(signature.pngBase64, signature.color).catch(() => null);
        if (next) setSaved(await listSignatures());
      }
    },
    [addSignature]
  );

  const onUseSaved = useCallback(
    (signature: SavedSignature) => {
      setCapturing(false);
      Image.getSize(
        `data:image/png;base64,${signature.pngBase64}`,
        (w, h) => addSignature(signature.pngBase64, w / Math.max(1, h)),
        // A saved signature is always wider than tall; 3:1 is a safe fallback.
        () => addSignature(signature.pngBase64, 3)
      );
    },
    [addSignature]
  );

  const onDeleteSaved = useCallback(async (id: string) => {
    await deleteSignature(id);
    setSaved(await listSignatures());
  }, []);

  const updateBox = useCallback(
    (id: string, rectPx: Rect) => {
      if (!pageBox) return;
      setPlaced((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                box: {
                  x: rectPx.x / pageBox.width,
                  y: rectPx.y / pageBox.height,
                  width: rectPx.width / pageBox.width,
                  height: rectPx.height / pageBox.height,
                },
              }
            : p
        )
      );
    },
    [pageBox]
  );

  const duplicate = useCallback((id: string) => {
    setPlaced((prev) => {
      const original = prev.find((p) => p.id === id);
      if (!original) return prev;
      const copy: Placed = {
        ...original,
        id: generateId(),
        box: {
          ...original.box,
          x: Math.min(0.98 - original.box.width, original.box.x + 0.04),
          y: Math.min(0.98 - original.box.height, original.box.y + 0.04),
        },
      };
      return [...prev, copy];
    });
  }, []);

  const onPage = placed.filter((p) => p.pageIndex === pageIndex);

  // ---- apply ----------------------------------------------------------------

  const apply = useCallback(async () => {
    if (!source || !placed.length) return;

    const placements: SignaturePlacement[] = placed.map((p) => ({
      pageIndex: p.pageIndex,
      x: p.box.x,
      y: p.box.y,
      width: p.box.width,
      height: p.box.height,
      pngBase64: p.pngBase64,
    }));

    const doc = await run<DocumentMeta>(
      (report) =>
        signPdf({
          pdfUri: source.uri,
          placements,
          fileName: `${source.name.replace(/\.pdf$/i, '')} (signed)`,
          onProgress: report,
        }),
      { initialStatus: 'Opening the document…' }
    );

    if (doc) setResult(doc);
  }, [placed, run, source]);

  // ---- render: picker -------------------------------------------------------

  if (!source) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Header title="Sign a document" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.pickerContent}>
          <Pressable
            onPress={browse}
            accessibilityRole="button"
            accessibilityLabel="Browse for a PDF"
            style={({ pressed }) => [styles.dropCard, pressed && styles.pressed]}
          >
            <View style={styles.dropIcon}>
              <MaterialCommunityIcons name="draw-pen" size={30} color={toolAccents.sign.fg} />
            </View>
            <Text style={[typography.titleMd, styles.dropTitle]}>Choose a PDF to sign</Text>
            <Text style={[typography.bodyMd, styles.dropBody]}>
              Browse your phone, or pick one of your recent documents below.
            </Text>
          </Pressable>

          {loadingSource ? (
            <Text style={[typography.bodyMd, styles.loading]}>Opening…</Text>
          ) : null}

          {recents.length ? (
            <>
              <Text style={[typography.titleMd, styles.pickerLabel]}>Recent documents</Text>
              {recents.map((doc) => (
                <Card
                  key={doc.id}
                  style={styles.recentRow}
                  padded={false}
                  onPress={() => void openDocument(doc)}
                  accessibilityLabel={doc.name}
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
                        {doc.name}
                      </Text>
                      <Text style={typography.labelMd}>{formatDocumentMeta(doc)}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={22}
                      color={colors.outline}
                    />
                  </View>
                </Card>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- render: canvas -------------------------------------------------------

  const pageCount = source.geometry.length;
  const previewUri = source.previewUris?.[pageIndex];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header
        title="Sign document"
        subtitle={source.name}
        onBack={() => navigation.goBack()}
        right={
          zoom > 1 ? (
            <Pressable onPress={resetZoom} hitSlop={HIT_SLOP} accessibilityLabel="Reset zoom">
              <MaterialCommunityIcons name="magnify-minus-outline" size={22} color={colors.primary} />
            </Pressable>
          ) : null
        }
      />

      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) =>
          setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
        {...pageResponder.panHandlers}
      >
        {pageBox ? (
          <Pressable
            onPress={() => setSelectedId(null)}
            style={[
              styles.page,
              {
                width: pageBox.width,
                height: pageBox.height,
                transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: zoom }],
              },
            ]}
          >
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.placeholderPage}>
                <MaterialCommunityIcons name="text" size={26} color={colors.outlineVariant} />
                <Text style={[typography.labelMd, styles.placeholderText]}>
                  Page {pageIndex + 1} · {Math.round(source.geometry[pageIndex].width)} ×{' '}
                  {Math.round(source.geometry[pageIndex].height)} pt
                </Text>
                <Text style={[typography.labelSm, styles.placeholderNote]}>
                  Drawn to scale. Your signature lands exactly where you place it.
                </Text>
              </View>
            )}

            {onPage.map((p) => (
              <DraggableSignature
                key={p.id}
                pngBase64={p.pngBase64}
                rect={{
                  x: p.box.x * pageBox.width,
                  y: p.box.y * pageBox.height,
                  width: p.box.width * pageBox.width,
                  height: p.box.height * pageBox.height,
                }}
                containerWidth={pageBox.width}
                containerHeight={pageBox.height}
                scale={zoom}
                selected={selectedId === p.id}
                onSelect={() => setSelectedId(p.id)}
                onChange={(next) => updateBox(p.id, next)}
                onDuplicate={() => duplicate(p.id)}
                onReplace={() => {
                  setReplacingId(p.id);
                  setCapturing(true);
                }}
                onDelete={() => {
                  setPlaced((prev) => prev.filter((x) => x.id !== p.id));
                  setSelectedId(null);
                }}
              />
            ))}
          </Pressable>
        ) : null}
      </View>

      {pageCount > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pageStrip}
        >
          {source.geometry.map((_, i) => {
            const active = i === pageIndex;
            const count = placed.filter((p) => p.pageIndex === i).length;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setPageIndex(i);
                  setSelectedId(null);
                  resetZoom();
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Page ${i + 1}${count ? `, ${count} signature(s)` : ''}`}
                style={[styles.pageChip, active && styles.pageChipActive]}
              >
                <Text
                  style={[
                    typography.labelMd,
                    styles.pageChipText,
                    active && styles.pageChipTextActive,
                  ]}
                >
                  {i + 1}
                </Text>
                {count ? <View style={styles.pageChipDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {busy ? (
        <View style={styles.progressWrap}>
          <ProgressBar value={progress} label="Stamping your signature" status={status} />
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

      <BottomActionBar
        caption={
          placed.length
            ? 'Pinch to zoom · drag a signature to move it · pull a corner to resize'
            : 'Draw your signature, then drag it onto the page'
        }
      >
        <View style={styles.actionRow}>
          <Button
            label="Add signature"
            icon="draw-pen"
            variant="secondary"
            size="lg"
            style={styles.actionHalf}
            disabled={busy}
            onPress={() => {
              setReplacingId(null);
              setCapturing(true);
            }}
          />
          <Button
            label="Apply & save"
            icon="check"
            size="lg"
            style={styles.actionHalf}
            loading={busy}
            disabled={!placed.length || busy}
            onPress={apply}
          />
        </View>
      </BottomActionBar>

      <SignatureCaptureModal
        visible={capturing}
        saved={saved}
        onClose={() => {
          setCapturing(false);
          setReplacingId(null);
        }}
        onCapture={onCapture}
        onUseSaved={onUseSaved}
        onDeleteSaved={onDeleteSaved}
      />

      <ResultSheet
        visible={Boolean(result)}
        doc={result}
        title="Signed"
        note="A signed copy was saved. Your original is untouched."
        onClose={() => setResult(null)}
        onDone={() => {
          const id = result?.id;
          setResult(null);
          navigation.navigate('Home', { highlightDocumentId: id });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  pickerContent: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl },
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
    backgroundColor: toolAccents.sign.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dropTitle: { marginBottom: spacing.xs },
  dropBody: { textAlign: 'center' },
  loading: { textAlign: 'center', marginTop: spacing.md },
  pickerLabel: { marginTop: spacing.lg, marginBottom: spacing.sm + 4 },
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

  stage: {
    flex: 1,
    margin: spacing.gutter,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  page: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  placeholderPage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  placeholderText: { textAlign: 'center' },
  placeholderNote: { textAlign: 'center', color: colors.outline },

  pageStrip: { paddingHorizontal: spacing.gutter, gap: spacing.sm, paddingBottom: spacing.sm },
  pageChip: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageChipActive: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  pageChipText: { color: colors.onSurfaceVariant, fontWeight: '700' },
  pageChipTextActive: { color: colors.onPrimary },
  pageChipDot: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },

  progressWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.gutter,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorContainer,
  },
  errorText: { flex: 1, color: colors.onErrorContainer },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionHalf: { flex: 1, minHeight: MIN_TOUCH },
});

export default SignScreen;
