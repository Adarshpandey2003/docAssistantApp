/**
 * Scan filters, expressed as SVG feColorMatrix matrices.
 *
 * expo-image-manipulator only does geometry (resize / rotate / flip / crop), so
 * colour work has to happen somewhere else. react-native-svg's FeColorMatrix is
 * the one pixel-shader we get inside Expo Go, and Svg.toDataURL() reads the
 * result back out. See FilterCanvas.tsx for the capture side.
 *
 * Each matrix is the standard 4x5 feColorMatrix: rows R,G,B,A, columns
 * R,G,B,A,offset. All three colour rows share the luminance coefficients, which
 * is what turns the image greyscale; `c` then stretches contrast about a pivot
 * `p`, giving offset = p * (1 - c).
 */

export type ScanFilter = 'original' | 'document' | 'bw' | 'grayscale';

export const FILTER_LABELS: Record<ScanFilter, string> = {
  original: 'Original',
  document: 'Document',
  bw: 'B&W',
  grayscale: 'Greyscale',
};

export const FILTER_ORDER: ScanFilter[] = ['original', 'document', 'bw', 'grayscale'];

/** Rec. 709 luminance weights. */
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

function luminanceMatrix(contrast: number, pivot: number): number[] {
  const offset = pivot * (1 - contrast);
  const r = LR * contrast;
  const g = LG * contrast;
  const b = LB * contrast;
  // prettier-ignore
  return [
    r, g, b, 0, offset,
    r, g, b, 0, offset,
    r, g, b, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

// prettier-ignore
const IDENTITY = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

export const FILTER_MATRICES: Record<ScanFilter, number[]> = {
  original: IDENTITY,
  /** Paper pushed to white, ink pushed to black, mid-tones kept readable. */
  document: luminanceMatrix(2.4, 0.58),
  /** Effectively a threshold — the ramp is steep enough to read as 1-bit. */
  bw: luminanceMatrix(8, 0.55),
  /** Plain desaturation, contrast untouched. */
  grayscale: luminanceMatrix(1, 0.5),
};

export function matrixString(filter: ScanFilter): string {
  return FILTER_MATRICES[filter].map((n) => Number(n.toFixed(4))).join(' ');
}

export function isIdentityFilter(filter: ScanFilter): boolean {
  return filter === 'original';
}
