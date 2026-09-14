import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PDFDocument, degrees } from 'pdf-lib';
import { Buffer as BufferShim } from 'buffer';

import {
  DocumentMeta,
  fileSize,
  resolveOutputPath,
  saveDocument,
  sanitizeFileName,
} from './storageService';

/**
 * The document engine. Everything in here is pure JS + Expo modules, so it runs
 * unmodified inside Expo Go — no prebuild, no custom native code.
 *
 * Boundaries worth knowing:
 *  - pdf-lib can *write* PDFs and re-embed images, but it cannot decode the DCT
 *    (JPEG) streams already inside a third-party PDF. That shapes compressPdf()
 *    below: we get large, real savings on documents this app produced (we still
 *    hold the source images) and only structural savings on imported ones.
 *  - Text layout for .docx goes through expo-print, which hands the HTML to the
 *    Android WebView's PDF exporter. That is the only real text renderer
 *    available inside Expo Go.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PdfQuality = 'small' | 'balanced' | 'high';
export type CompressionLevel = 'low' | 'medium' | 'high';
export type PageSizeMode = 'a4' | 'fit';

export interface ProgressReport {
  /** 0..1 */
  value: number;
  /** Plain-language line shown under the progress bar. */
  status: string;
}

export type ProgressCallback = (report: ProgressReport) => void;

export interface ImageToPdfOptions {
  fileName: string;
  quality?: PdfQuality;
  pageSize?: PageSizeMode;
  onProgress?: ProgressCallback;
}

export interface WordToPdfOptions {
  fileName?: string;
  onProgress?: ProgressCallback;
}

export interface SignaturePlacement {
  /** 0-based page index. */
  pageIndex: number;
  /** Normalised 0..1, measured from the page's top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  /** PNG base64 without the data: prefix. */
  pngBase64: string;
}

export interface SignPdfOptions {
  pdfUri: string;
  placements: SignaturePlacement[];
  fileName?: string;
  onProgress?: ProgressCallback;
}

export interface CompressionEstimate {
  level: CompressionLevel;
  estimatedBytes: number;
  /** 0..1 */
  savingsRatio: number;
  /** True when we hold the source images and can genuinely re-encode. */
  canReencodeImages: boolean;
}

export interface PageGeometry {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** A4 in PDF points (72 per inch). */
export const A4 = { width: 595.28, height: 841.89 } as const;

/** Long-edge pixel budget + JPEG quality per export preset. A4 @ 300dpi = 3508px. */
const QUALITY_PRESETS: Record<PdfQuality, { maxEdge: number; compress: number; label: string }> = {
  small: { maxEdge: 1754, compress: 0.5, label: '~150 DPI' },
  balanced: { maxEdge: 2339, compress: 0.72, label: '~200 DPI' },
  high: { maxEdge: 3508, compress: 0.9, label: '~300 DPI' },
};

const COMPRESSION_PRESETS: Record<
  CompressionLevel,
  { maxEdge: number; compress: number; expectedRatio: number }
> = {
  // `expectedRatio` is the fraction of the original size we expect to keep. It
  // only drives the pre-run estimate; the number shown after the run is measured.
  low: { maxEdge: 2339, compress: 0.7, expectedRatio: 0.77 },
  medium: { maxEdge: 1654, compress: 0.5, expectedRatio: 0.28 },
  high: { maxEdge: 1100, compress: 0.34, expectedRatio: 0.13 },
};

export function qualityLabel(quality: PdfQuality): string {
  return QUALITY_PRESETS[quality].label;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

const B64 = FileSystem.EncodingType.Base64;

async function readBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: B64 });
}

async function writeBase64(uri: string, data: string): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, data, { encoding: B64 });
}

/**
 * base64 -> ArrayBuffer, for mammoth which insists on one.
 *
 * Hermes has `atob`; the Buffer branch is the fallback for anywhere it does not
 * (and Buffer itself is installed by `src/polyfills.ts` at startup).
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob
    ? globalThis.atob(base64)
    : BufferShim.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const report = (cb: ProgressCallback | undefined, value: number, status: string) => {
  cb?.({ value, status });
};

/**
 * Normalises any incoming image to a JPEG of bounded size and returns its
 * base64 plus pixel dimensions. Resizing by the long edge keeps landscape
 * captures from being upscaled into the page.
 */
async function prepareImage(
  uri: string,
  maxEdge: number,
  compress: number
): Promise<{ base64: string; width: number; height: number }> {
  // A zero-action pass is the cheapest way to learn the source dimensions.
  const probe = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const longEdge = Math.max(probe.width, probe.height);
  const actions: ImageManipulator.Action[] =
    longEdge > maxEdge
      ? [
          probe.width >= probe.height
            ? { resize: { width: maxEdge } }
            : { resize: { height: maxEdge } },
        ]
      : [];

  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!out.base64) {
    throw new Error('The image could not be read. Try picking it again.');
  }
  return { base64: out.base64, width: out.width, height: out.height };
}

/** Centres an image on an A4 page with a small margin, preserving aspect ratio. */
function fitOnA4(imgWidth: number, imgHeight: number, margin = 18) {
  const boxW = A4.width - margin * 2;
  const boxH = A4.height - margin * 2;
  const scale = Math.min(boxW / imgWidth, boxH / imgHeight);
  const width = imgWidth * scale;
  const height = imgHeight * scale;
  return {
    width,
    height,
    x: (A4.width - width) / 2,
    y: (A4.height - height) / 2,
  };
}

// ---------------------------------------------------------------------------
// Reading existing PDFs
// ---------------------------------------------------------------------------

export async function loadPdf(uri: string): Promise<PDFDocument> {
  const base64 = await readBase64(uri);
  try {
    // Signed/encrypted-but-openable files are common in the wild; ignoring
    // encryption lets us at least read geometry rather than hard-failing.
    return await PDFDocument.load(base64, { ignoreEncryption: true });
  } catch (err) {
    throw new Error(
      'That PDF could not be opened. It may be password protected or damaged.'
    );
  }
}

export async function getPageCount(uri: string): Promise<number> {
  return (await loadPdf(uri)).getPageCount();
}

/** Page sizes in PDF points — drives the signer's to-scale page canvas. */
export async function getPageGeometry(uri: string): Promise<PageGeometry[]> {
  const doc = await loadPdf(uri);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height };
  });
}

// ---------------------------------------------------------------------------
// 1. Images -> PDF
// ---------------------------------------------------------------------------

/**
 * Builds a PDF from an ordered list of local image URIs.
 *
 * Uses pdf-lib rather than expo-print so page geometry is exact and no HTML/CSS
 * rounding creeps into the output.
 */
export async function createFromImages(
  imageUris: string[],
  options: ImageToPdfOptions
): Promise<DocumentMeta> {
  if (!imageUris.length) {
    throw new Error('Add at least one page before exporting.');
  }

  const { fileName, quality = 'balanced', pageSize = 'a4', onProgress } = options;
  const preset = QUALITY_PRESETS[quality];

  report(onProgress, 0.02, 'Preparing pages…');

  const pdf = await PDFDocument.create();
  pdf.setProducer('DocAssistant');
  pdf.setCreator('DocAssistant');
  pdf.setCreationDate(new Date());

  for (let i = 0; i < imageUris.length; i += 1) {
    const { base64, width, height } = await prepareImage(
      imageUris[i],
      preset.maxEdge,
      preset.compress
    );

    const embedded = await pdf.embedJpg(base64);

    if (pageSize === 'fit') {
      // One page per image, sized to the image at 72dpi-equivalent points.
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    } else {
      const page = pdf.addPage([A4.width, A4.height]);
      const box = fitOnA4(width, height);
      page.drawImage(embedded, box);
    }

    report(
      onProgress,
      0.05 + (0.85 * (i + 1)) / imageUris.length,
      `Adding page ${i + 1} of ${imageUris.length} — this happens entirely on your device.`
    );
  }

  report(onProgress, 0.93, 'Writing the PDF…');
  const out = await pdf.saveAsBase64({ useObjectStreams: true });

  const target = await resolveOutputPath(fileName);
  await writeBase64(target, out);

  report(onProgress, 1, 'Saved.');

  return saveDocument({
    name: target.split('/').pop() ?? sanitizeFileName(fileName),
    uri: target,
    size: await fileSize(target),
    pageCount: imageUris.length,
    kind: 'images',
    sourceImageUris: imageUris,
  });
}

// ---------------------------------------------------------------------------
// 2. Word (.docx) -> PDF
// ---------------------------------------------------------------------------

/** Print stylesheet wrapped around mammoth's output so the PDF reads like a document. */
function wrapHtmlForPrint(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body {
    font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5pt; line-height: 1.55; color: #191C1E;
    margin: 0; -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 20pt; font-weight: 700; margin: 0 0 12pt; line-height: 1.25; }
  h2 { font-size: 15pt; font-weight: 700; margin: 18pt 0 8pt; line-height: 1.3; }
  h3 { font-size: 12.5pt; font-weight: 600; margin: 14pt 0 6pt; }
  p { margin: 0 0 9pt; orphans: 2; widows: 2; }
  ul, ol { margin: 0 0 9pt 18pt; padding: 0; }
  li { margin-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; page-break-inside: avoid; }
  td, th { border: 1px solid #C3C6D7; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #F2F4F6; font-weight: 600; }
  img { max-width: 100%; height: auto; }
  a { color: #1353D6; text-decoration: none; }
  blockquote { margin: 0 0 9pt; padding-left: 12pt; border-left: 3px solid #C3C6D7; color: #434654; }
</style></head>
<body>${bodyHtml}</body></html>`;
}

/**
 * Converts a .docx to PDF entirely on-device: mammoth parses the OOXML into
 * semantic HTML, then expo-print renders that HTML to a real PDF.
 *
 * mammoth is imported lazily and from its browser bundle — the default entry
 * reaches for Node's `fs` and will not resolve under Metro.
 */
export async function wordToPdf(
  docxUri: string,
  options: WordToPdfOptions = {}
): Promise<DocumentMeta> {
  const { onProgress } = options;

  report(onProgress, 0.05, 'Reading the document…');
  const base64 = await readBase64(docxUri);
  const arrayBuffer = base64ToArrayBuffer(base64);

  report(onProgress, 0.2, 'Unpacking the .docx…');

  let html: string;
  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.convertToHtml({ arrayBuffer });
    html = result.value;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `This file could not be read as a Word document. Make sure it is a .docx (not the older .doc format). [${detail}]`
    );
  }

  if (!html.trim()) {
    throw new Error('That document appears to be empty — there was nothing to convert.');
  }

  report(onProgress, 0.55, 'Laying out the pages — this happens entirely on your device.');

  const { uri: tempUri } = await Print.printToFileAsync({
    html: wrapHtmlForPrint(html),
    base64: false,
  });

  report(onProgress, 0.85, 'Writing the PDF…');

  const sourceName = decodeURIComponent(docxUri.split('/').pop() ?? 'Document.docx');
  const fileName = options.fileName ?? sourceName.replace(/\.docx?$/i, '');
  const target = await resolveOutputPath(fileName);
  await FileSystem.moveAsync({ from: tempUri, to: target });

  const pageCount = await getPageCount(target).catch(() => 1);
  report(onProgress, 1, 'Saved.');

  return saveDocument({
    name: target.split('/').pop() ?? sanitizeFileName(fileName),
    uri: target,
    size: await fileSize(target),
    pageCount,
    kind: 'word',
  });
}

// ---------------------------------------------------------------------------
// 3. Signing
// ---------------------------------------------------------------------------

/**
 * Stamps one or more signature PNGs onto an existing PDF.
 *
 * Placements arrive normalised (0..1) with a top-left origin because that is
 * how the on-screen canvas thinks. PDF user space has its origin at the
 * bottom-left, so the y axis is flipped here — this is the one conversion the
 * whole feature hinges on.
 */
export async function signPdf(options: SignPdfOptions): Promise<DocumentMeta> {
  const { pdfUri, placements, onProgress } = options;

  if (!placements.length) {
    throw new Error('Place at least one signature before saving.');
  }

  report(onProgress, 0.1, 'Opening the document…');
  const pdf = await loadPdf(pdfUri);
  const pages = pdf.getPages();

  for (let i = 0; i < placements.length; i += 1) {
    const placement = placements[i];
    const page = pages[placement.pageIndex];
    if (!page) continue;

    const { width: pw, height: ph } = page.getSize();
    const png = await pdf.embedPng(placement.pngBase64);

    const w = placement.width * pw;
    const h = placement.height * ph;
    const x = placement.x * pw;
    // Flip: canvas y measures down from the top, PDF y measures up from the bottom.
    const y = ph - placement.y * ph - h;

    page.drawImage(png, {
      x,
      y,
      width: w,
      height: h,
      rotate: degrees(placement.rotation ?? 0),
    });

    report(
      onProgress,
      0.15 + (0.7 * (i + 1)) / placements.length,
      `Placing signature ${i + 1} of ${placements.length}…`
    );
  }

  report(onProgress, 0.9, 'Writing the signed PDF…');
  const out = await pdf.saveAsBase64({ useObjectStreams: true });

  const sourceName = decodeURIComponent(pdfUri.split('/').pop() ?? 'Document.pdf');
  const fileName = options.fileName ?? `${sourceName.replace(/\.pdf$/i, '')}_signed`;
  const target = await resolveOutputPath(fileName);
  await writeBase64(target, out);

  report(onProgress, 1, 'Saved.');

  return saveDocument({
    name: target.split('/').pop() ?? sanitizeFileName(fileName),
    uri: target,
    size: await fileSize(target),
    pageCount: pages.length,
    kind: 'signed',
  });
}

// ---------------------------------------------------------------------------
// 4. Compression
// ---------------------------------------------------------------------------

/**
 * Pre-run size estimate for the three levels.
 *
 * Honest about its own accuracy: when the document came from this app we still
 * hold the source images and the estimate is close. For an imported PDF we
 * cannot inspect the embedded image streams from JS, so only the structural
 * saving is promised — the UI says as much.
 */
export function estimateCompression(doc: DocumentMeta): CompressionEstimate[] {
  const canReencodeImages = Boolean(doc.sourceImageUris?.length);

  return (['low', 'medium', 'high'] as CompressionLevel[]).map((level) => {
    const ratio = canReencodeImages
      ? COMPRESSION_PRESETS[level].expectedRatio
      : // Structural-only pass: object streams + metadata removal.
        ({ low: 0.97, medium: 0.94, high: 0.9 } as const)[level];

    return {
      level,
      estimatedBytes: Math.max(1024, Math.round(doc.size * ratio)),
      savingsRatio: 1 - ratio,
      canReencodeImages,
    };
  });
}

/**
 * Compresses a PDF, choosing the strongest strategy the document allows.
 *
 * Strategy A — rebuild from source images. Only possible for PDFs this app
 * generated, where `sourceImageUris` survived. Re-encodes every page image at a
 * lower resolution and JPEG quality, then rebuilds. Real, large savings.
 *
 * Strategy B — structural rewrite. For imported PDFs. Strips metadata and
 * re-serialises with object streams and compressed cross-reference tables.
 * Typically single-digit percent: pdf-lib cannot re-encode image streams it
 * did not create, and there is no JPEG decoder available to us in Expo Go.
 */
export async function compressPdf(
  doc: DocumentMeta,
  level: CompressionLevel,
  onProgress?: ProgressCallback
): Promise<DocumentMeta> {
  const preset = COMPRESSION_PRESETS[level];
  const baseName = doc.name.replace(/\.pdf$/i, '');

  if (doc.sourceImageUris?.length) {
    // ---- Strategy A ----
    report(onProgress, 0.05, 'Re-encoding page images…');

    const rebuilt = await PDFDocument.create();
    rebuilt.setProducer('DocAssistant');
    const uris = doc.sourceImageUris;

    for (let i = 0; i < uris.length; i += 1) {
      const { base64, width, height } = await prepareImage(
        uris[i],
        preset.maxEdge,
        preset.compress
      );
      const embedded = await rebuilt.embedJpg(base64);
      const page = rebuilt.addPage([A4.width, A4.height]);
      page.drawImage(embedded, fitOnA4(width, height));

      report(
        onProgress,
        0.1 + (0.75 * (i + 1)) / uris.length,
        `Shrinking page ${i + 1} of ${uris.length} — this happens entirely on your device.`
      );
    }

    report(onProgress, 0.9, 'Writing the smaller PDF…');
    const out = await rebuilt.saveAsBase64({ useObjectStreams: true });
    const target = await resolveOutputPath(`${baseName}_compressed`);
    await writeBase64(target, out);
    report(onProgress, 1, 'Saved.');

    return saveDocument({
      name: target.split('/').pop() ?? `${baseName}_compressed.pdf`,
      uri: target,
      size: await fileSize(target),
      pageCount: uris.length,
      kind: 'compressed',
      sourceImageUris: uris,
    });
  }

  // ---- Strategy B ----
  report(onProgress, 0.15, 'Opening the document…');
  const pdf = await loadPdf(doc.uri);

  report(onProgress, 0.45, 'Removing metadata and rebuilding the file structure…');
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('DocAssistant');
  pdf.setCreator('DocAssistant');

  report(onProgress, 0.7, 'Writing the smaller PDF…');
  const out = await pdf.saveAsBase64({ useObjectStreams: true });
  const target = await resolveOutputPath(`${baseName}_compressed`);
  await writeBase64(target, out);
  report(onProgress, 1, 'Saved.');

  return saveDocument({
    name: target.split('/').pop() ?? `${baseName}_compressed.pdf`,
    uri: target,
    size: await fileSize(target),
    pageCount: pdf.getPageCount(),
    kind: 'compressed',
  });
}

// ---------------------------------------------------------------------------
// 5. Sharing
// ---------------------------------------------------------------------------

export async function sharePdf(uri: string, dialogTitle = 'Share document'): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
}

/**
 * Opens the Android print preview for a finished PDF.
 *
 * Expo Go has no embeddable PDF renderer, but the system print dialog *is* a
 * real renderer for the real file — so this is the one honest "preview the
 * actual PDF" affordance available to us. The user can back out of it, or send
 * it to a printer / "Save as PDF".
 */
export async function printPdf(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}

export const pdfService = {
  A4,
  qualityLabel,
  printPdf,
  loadPdf,
  getPageCount,
  getPageGeometry,
  createFromImages,
  wordToPdf,
  signPdf,
  estimateCompression,
  compressPdf,
  sharePdf,
  base64ToArrayBuffer,
};

export default pdfService;
