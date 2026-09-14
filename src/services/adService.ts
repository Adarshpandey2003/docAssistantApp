import { AD_POLICY, AD_UNITS, APP_CONFIG, type AdUnitId } from '../constants/config';

/**
 * Abstracted ad manager.
 *
 * V1 contract: while `APP_CONFIG.ADS_ENABLED` is false every method here is a
 * synchronous no-op. `showInterstitialIfReady()` resolves on the same tick, so
 * wrapping a tool completion in it costs nothing and shifts nothing. Call sites
 * never branch on the flag themselves — that is the whole point of this module.
 *
 * V2: implement `loadInterstitial` / `presentInterstitial` against the provider
 * SDK (react-native-google-mobile-ads for admob). Note that AdMob requires a
 * custom dev build; it does not run in Expo Go. Keeping the surface area down to
 * these two functions is what makes that swap a contained change.
 */

export type AdProvider = typeof APP_CONFIG.AD_PROVIDER;

interface AdSessionState {
  shown: number;
  lastShownAt: number;
  completedRuns: number;
  loaded: boolean;
}

const session: AdSessionState = {
  shown: 0,
  lastShownAt: 0,
  completedRuns: 0,
  loaded: false,
};

export function areAdsEnabled(): boolean {
  return APP_CONFIG.ADS_ENABLED && APP_CONFIG.AD_PROVIDER !== 'none';
}

export function getAdUnitId(unit: AdUnitId): string {
  return AD_UNITS[unit];
}

/**
 * Warm the interstitial cache. Safe and free to call on app start.
 */
export async function initialize(): Promise<void> {
  if (!areAdsEnabled()) return;
  // TODO(v2): initialise the provider SDK, then preload the first interstitial.
  await loadInterstitial();
}

async function loadInterstitial(): Promise<void> {
  if (!areAdsEnabled()) return;
  // TODO(v2): request an interstitial for AD_UNITS.toolInterstitial and set
  // session.loaded from the load callback.
  session.loaded = false;
}

async function presentInterstitial(): Promise<void> {
  if (!areAdsEnabled() || !session.loaded) return;
  // TODO(v2): present the cached interstitial and await its dismissal.
}

/** Record that the user finished a tool run — feeds the grace period rule. */
export function noteToolRunCompleted(): void {
  session.completedRuns += 1;
}

function isReady(): boolean {
  if (!areAdsEnabled()) return false;
  if (!session.loaded) return false;
  if (session.shown >= AD_POLICY.maxInterstitialsPerSession) return false;
  if (session.completedRuns < AD_POLICY.gracePeriodRuns) return false;
  return Date.now() - session.lastShownAt >= AD_POLICY.minIntervalMs;
}

/**
 * Gate to wrap around a completed tool action.
 *
 * Resolves immediately when ads are off, so:
 *
 *   await pdfService.signPdf(...)
 *   await adService.showInterstitialIfReady()
 *   navigation.navigate('Home')
 *
 * behaves identically in V1 and V2 apart from the ad itself.
 */
export async function showInterstitialIfReady(): Promise<void> {
  noteToolRunCompleted();
  if (!isReady()) return;

  session.shown += 1;
  session.lastShownAt = Date.now();
  await presentInterstitial();
  await loadInterstitial();
}

/** Test/debug helper — resets the pacing counters. */
export function resetSession(): void {
  session.shown = 0;
  session.lastShownAt = 0;
  session.completedRuns = 0;
  session.loaded = false;
}

export const adService = {
  areAdsEnabled,
  getAdUnitId,
  initialize,
  noteToolRunCompleted,
  showInterstitialIfReady,
  resetSession,
};

export default adService;
