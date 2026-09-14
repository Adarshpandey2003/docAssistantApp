/**
 * Single source of truth for the V1 -> V2 ad switch.
 *
 * V1 ships with ADS_ENABLED false. Every ad surface in the app renders `null`
 * and every ad gate resolves synchronously, so there is no layout shift, no
 * delay, and no placeholder space reserved. Turning ads on in V2 is:
 *
 *   1. flip ADS_ENABLED to true
 *   2. drop real unit ids into AD_UNITS
 *   3. implement the two TODOs in src/services/adService.ts
 *
 * No screen, component, or hook needs to change.
 */
export const APP_CONFIG = {
  ADS_ENABLED: false,
  AD_PROVIDER: 'admob' as 'admob' | 'applovin' | 'none',
} as const;

export const AD_UNITS = {
  homeBanner: '',
  resultBanner: '',
  toolInterstitial: '',
} as const;

export type AdUnitId = keyof typeof AD_UNITS;

/** Ad pacing rules. Inert while ADS_ENABLED is false. */
export const AD_POLICY = {
  /** Never show two interstitials closer together than this. */
  minIntervalMs: 90_000,
  /** Let the user finish this many tool runs before the first interstitial. */
  gracePeriodRuns: 3,
  /** Hard ceiling per app session. */
  maxInterstitialsPerSession: 4,
} as const;

export const STORAGE_KEYS = {
  documents: '@docassistant/documents/v1',
  signatures: '@docassistant/signatures/v1',
  settings: '@docassistant/settings/v1',
} as const;

/** Where generated PDFs live, relative to the app document directory. */
export const OUTPUT_DIR_NAME = 'DocAssistant';
