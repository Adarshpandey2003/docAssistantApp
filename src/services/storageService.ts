import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { OUTPUT_DIR_NAME, STORAGE_KEYS } from '../constants/config';

/**
 * Document metadata store.
 *
 * AsyncStorage holds only the index; the PDFs themselves live on disk under
 * `<documentDirectory>/DocAssistant/`. Nothing is ever uploaded.
 */

export type DocumentKind = 'scan' | 'images' | 'word' | 'signed' | 'compressed' | 'imported';

export interface DocumentMeta {
  id: string;
  /** Display name including the .pdf extension. */
  name: string;
  uri: string;
  /** Bytes. */
  size: number;
  pageCount: number;
  kind: DocumentKind;
  /** ISO 8601. */
  createdAt: string;
  /**
   * Source images for app-generated PDFs, kept so the compressor can re-encode
   * from the originals instead of guessing at embedded streams. Empty for
   * imported files.
   */
  sourceImageUris?: string[];
}

export interface SavedSignature {
  id: string;
  /** Raw PNG base64, no data: prefix. */
  pngBase64: string;
  color: string;
  createdAt: string;
}

export interface AppSettings {
  defaultQuality: 'small' | 'balanced' | 'high';
  defaultFilter: 'original' | 'document' | 'bw' | 'grayscale';
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultQuality: 'balanced',
  defaultFilter: 'document',
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function outputDirectory(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error('No writable document directory is available on this device.');
  }
  return `${base}${OUTPUT_DIR_NAME}/`;
}

export async function ensureOutputDirectory(): Promise<string> {
  const dir = outputDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strips characters Android's MediaStore and share sheet dislike. */
export function sanitizeFileName(raw: string): string {
  const trimmed = raw.trim().replace(/\.pdf$/i, '');
  const safe = trimmed.replace(/[^a-zA-Z0-9-_ ()]/g, '_').replace(/\s+/g, ' ').slice(0, 80);
  return `${safe.length ? safe : 'Document'}.pdf`;
}

/**
 * Resolves a collision-free path inside the output directory, appending
 * " (2)", " (3)" … the way a file manager would.
 */
export async function resolveOutputPath(fileName: string): Promise<string> {
  const dir = await ensureOutputDirectory();
  const safe = sanitizeFileName(fileName);
  const stem = safe.replace(/\.pdf$/i, '');

  let candidate = `${dir}${stem}.pdf`;
  let counter = 2;
  // eslint-disable-next-line no-await-in-loop
  while ((await FileSystem.getInfoAsync(candidate)).exists) {
    candidate = `${dir}${stem} (${counter}).pdf`;
    counter += 1;
  }
  return candidate;
}

export async function fileSize(uri: string): Promise<number> {
  // The legacy API always reports size for a file; there is no `size` option.
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
}

// ---------------------------------------------------------------------------
// Document index
// ---------------------------------------------------------------------------

export async function listDocuments(): Promise<DocumentMeta[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.documents);
  if (!raw) return [];

  let parsed: DocumentMeta[];
  try {
    parsed = JSON.parse(raw) as DocumentMeta[];
  } catch {
    // A corrupt index should not brick the app; the files are still on disk.
    await AsyncStorage.removeItem(STORAGE_KEYS.documents);
    return [];
  }

  return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Drops index entries whose file has since vanished (user cleared app data,
 * OS reclaimed cache, etc.) so the Recent list never offers a dead row.
 */
export async function listDocumentsPruned(): Promise<DocumentMeta[]> {
  const docs = await listDocuments();
  const checks = await Promise.all(
    docs.map(async (doc) => ({ doc, exists: (await FileSystem.getInfoAsync(doc.uri)).exists }))
  );

  const alive = checks.filter((c) => c.exists).map((c) => c.doc);
  if (alive.length !== docs.length) {
    await writeIndex(alive);
  }
  return alive;
}

async function writeIndex(docs: DocumentMeta[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(docs));
}

export async function saveDocument(
  meta: Omit<DocumentMeta, 'id' | 'createdAt'> & Partial<Pick<DocumentMeta, 'id' | 'createdAt'>>
): Promise<DocumentMeta> {
  const record: DocumentMeta = {
    ...meta,
    id: meta.id ?? generateId(),
    createdAt: meta.createdAt ?? new Date().toISOString(),
  };

  const docs = await listDocuments();
  const next = [record, ...docs.filter((d) => d.id !== record.id)];
  await writeIndex(next);
  return record;
}

export async function getDocument(id: string): Promise<DocumentMeta | undefined> {
  return (await listDocuments()).find((d) => d.id === id);
}

export async function renameDocument(id: string, nextName: string): Promise<DocumentMeta | undefined> {
  const docs = await listDocuments();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return undefined;

  const target = await resolveOutputPath(nextName);
  await FileSystem.moveAsync({ from: doc.uri, to: target });

  const updated: DocumentMeta = {
    ...doc,
    name: target.split('/').pop() ?? sanitizeFileName(nextName),
    uri: target,
  };
  await writeIndex(docs.map((d) => (d.id === id ? updated : d)));
  return updated;
}

/** Removes the index entry and the file. Source images are left alone. */
export async function deleteDocument(id: string): Promise<void> {
  const docs = await listDocuments();
  const doc = docs.find((d) => d.id === id);
  if (doc) {
    try {
      await FileSystem.deleteAsync(doc.uri, { idempotent: true });
    } catch {
      // Already gone — dropping the index entry is still the right outcome.
    }
  }
  await writeIndex(docs.filter((d) => d.id !== id));
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export async function listSignatures(): Promise<SavedSignature[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.signatures);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedSignature[];
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEYS.signatures);
    return [];
  }
}

export async function saveSignature(pngBase64: string, color: string): Promise<SavedSignature> {
  const record: SavedSignature = {
    id: generateId(),
    pngBase64,
    color,
    createdAt: new Date().toISOString(),
  };
  // Keep the three most recent so the picker stays small and storage bounded.
  const next = [record, ...(await listSignatures())].slice(0, 3);
  await AsyncStorage.setItem(STORAGE_KEYS.signatures, JSON.stringify(next));
  return record;
}

export async function deleteSignature(id: string): Promise<void> {
  const next = (await listSignatures()).filter((s) => s.id !== id);
  await AsyncStorage.setItem(STORAGE_KEYS.signatures, JSON.stringify(next));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
  return next;
}

// ---------------------------------------------------------------------------
// Formatting helpers used across screens
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** "12 Apr · 2.4 MB · 4 pages" — the metadata line from the design. */
export function formatDocumentMeta(doc: DocumentMeta): string {
  const pages = `${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}`;
  return [formatShortDate(doc.createdAt), formatBytes(doc.size), pages].filter(Boolean).join(' · ');
}

export const storageService = {
  outputDirectory,
  ensureOutputDirectory,
  generateId,
  sanitizeFileName,
  resolveOutputPath,
  fileSize,
  listDocuments,
  listDocumentsPruned,
  saveDocument,
  getDocument,
  renameDocument,
  deleteDocument,
  listSignatures,
  saveSignature,
  deleteSignature,
  getSettings,
  updateSettings,
  formatBytes,
  formatShortDate,
  formatDocumentMeta,
};

export default storageService;
