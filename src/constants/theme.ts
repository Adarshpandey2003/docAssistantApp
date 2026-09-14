import { Platform, TextStyle } from 'react-native';

/**
 * Design tokens lifted straight out of the Stitch design system
 * `assets/3316271637938318228` ("DocAssistant Material You" / Modern Vibrant v2).
 * See DESIGN.md for the full table and provenance.
 */

export const colors = {
  // Brand
  primary: '#1353D6',
  primaryContainer: '#3B6EF0',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#FFFFFF',
  primaryFixed: '#DBE1FF',
  primaryFixedDim: '#B4C5FF',
  onPrimaryFixedVariant: '#003DA9',

  secondary: '#006B5A',
  secondaryContainer: '#75F5D8',
  onSecondary: '#FFFFFF',
  onSecondaryContainer: '#00705E',
  secondaryTint: '#E3FAF3',

  tertiary: '#904D00',
  tertiaryContainer: '#B06417',
  onTertiary: '#FFFFFF',
  tertiaryFixed: '#FFDCC3',
  onTertiaryFixedVariant: '#6E3900',

  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#93000A',

  // Surfaces
  background: '#F8F9FB',
  surface: '#F8F9FB',
  surfaceLowest: '#FFFFFF',
  surfaceLow: '#F2F4F6',
  surfaceContainer: '#EDEEF0',
  surfaceHigh: '#E7E8EA',
  surfaceHighest: '#E1E2E4',

  // Text & lines
  onSurface: '#191C1E',
  onSurfaceVariant: '#434654',
  outline: '#737686',
  outlineVariant: '#C3C6D7',
  hairline: 'rgba(15, 23, 42, 0.08)',

  inverseSurface: '#2E3132',
  inverseOnSurface: '#F0F1F3',

  scrim: 'rgba(15, 23, 42, 0.45)',
  transparent: 'transparent',
} as const;

/** Per-tool accent pairs used by the dashboard grid. */
export const toolAccents = {
  scan: { tint: colors.primaryContainer, fg: colors.onPrimary },
  images: { tint: colors.primaryFixed, fg: colors.onPrimaryFixedVariant },
  word: { tint: colors.secondaryContainer, fg: colors.onSecondaryContainer },
  sign: { tint: colors.tertiaryFixed, fg: colors.onTertiaryFixedVariant },
  compress: { tint: colors.surfaceHigh, fg: colors.onSurfaceVariant },
  pdf: { tint: colors.errorContainer, fg: colors.onErrorContainer },
} as const;

export type ToolAccent = keyof typeof toolAccents;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  /** Screen gutter. */
  gutter: 16,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

/**
 * Stitch specifies Plus Jakarta Sans + Inter. We deliberately do not bundle font
 * files — that would add an `expo-font` loading gate for no functional gain — so
 * the families map onto the Android system stack while the size / weight /
 * line-height scale is preserved exactly. Swap these two constants and load the
 * real faces with expo-font if you want pixel-exact headlines.
 */
const headlineFamily = Platform.select({ android: 'sans-serif', default: 'System' });
const bodyFamily = Platform.select({ android: 'sans-serif', default: 'System' });
const headlineMediumFamily = Platform.select({ android: 'sans-serif-medium', default: 'System' });

const t = (style: TextStyle): TextStyle => style;

export const typography = {
  displayLg: t({
    fontFamily: headlineFamily,
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
    letterSpacing: -1,
    color: colors.onSurface,
  }),
  headlineLg: t({
    fontFamily: headlineFamily,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.onSurface,
  }),
  headlineLgMobile: t({
    fontFamily: headlineFamily,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.4,
    color: colors.onSurface,
  }),
  headlineMd: t({
    fontFamily: headlineFamily,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.2,
    color: colors.onSurface,
  }),
  titleLg: t({
    fontFamily: headlineMediumFamily,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    color: colors.onSurface,
  }),
  titleMd: t({
    fontFamily: headlineMediumFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.onSurface,
  }),
  bodyLg: t({
    fontFamily: bodyFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: colors.onSurface,
  }),
  bodyMd: t({
    fontFamily: bodyFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.onSurfaceVariant,
  }),
  labelMd: t({
    fontFamily: bodyFamily,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  }),
  labelSm: t({
    fontFamily: bodyFamily,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    color: colors.onSurfaceVariant,
  }),
} as const;

/**
 * Elevation is a hairline plus a diffused ambient shadow — never a hard drop
 * shadow. `elevation` is what Android actually honours; the iOS keys are there
 * so the same style object is portable.
 */
export const elevation = {
  none: {},
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const;

/** Minimum accessible touch target, per the design principles. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TOUCH = 48;

export const theme = {
  colors,
  toolAccents,
  spacing,
  radius,
  typography,
  elevation,
} as const;

export type Theme = typeof theme;
