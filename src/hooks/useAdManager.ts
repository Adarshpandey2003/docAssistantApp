import { useCallback, useEffect, useMemo } from 'react';

import { adService } from '../services/adService';

/**
 * Screen-level handle on the ad manager.
 *
 * `enabled` is false throughout V1, so screens can use it to decide whether to
 * render an AdContainer at all — though AdContainer already handles that case
 * on its own, which is the preferred route.
 */
export function useAdManager() {
  useEffect(() => {
    void adService.initialize();
  }, []);

  const gate = useCallback(async () => {
    await adService.showInterstitialIfReady();
  }, []);

  return useMemo(
    () => ({
      enabled: adService.areAdsEnabled(),
      /** Await after a tool run completes. No-op in V1. */
      gate,
      noteToolRunCompleted: adService.noteToolRunCompleted,
    }),
    [gate]
  );
}

export default useAdManager;
