import React, { useCallback } from 'react';

import { showInterstitialIfReady } from '../../services/adService';

/**
 * Wraps any async "tool finished" handler so an interstitial can be presented
 * between the work completing and the UI moving on.
 *
 * With ads off this adds one already-resolved await — no delay, no flash.
 *
 *   const onDone = useAdGatedAction(async () => {
 *     const doc = await pdfService.compressPdf(...);
 *     navigation.replace('Home', { highlight: doc.id });
 *   });
 */
export function useAdGatedAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult> | TResult
): (...args: TArgs) => Promise<TResult> {
  return useCallback(
    async (...args: TArgs) => {
      const result = await action(...args);
      await showInterstitialIfReady();
      return result;
    },
    [action]
  );
}

/**
 * HOC form, for class components or when the gate belongs at the screen
 * boundary rather than at a single callback.
 */
export interface WithAdInterstitialProps {
  /** Await this after a tool run completes. */
  runAdGate: () => Promise<void>;
}

export function withAdInterstitial<P extends object>(
  Wrapped: React.ComponentType<P & WithAdInterstitialProps>
): React.ComponentType<P> {
  const Gated: React.FC<P> = (props) => {
    const runAdGate = useCallback(() => showInterstitialIfReady(), []);
    return <Wrapped {...props} runAdGate={runAdGate} />;
  };

  Gated.displayName = `withAdInterstitial(${Wrapped.displayName ?? Wrapped.name ?? 'Component'})`;
  return Gated;
}

export default withAdInterstitial;
