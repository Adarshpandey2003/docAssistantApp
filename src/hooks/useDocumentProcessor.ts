import { useCallback, useRef, useState } from 'react';

import type { ProgressReport } from '../services/pdfService';
import { showInterstitialIfReady } from '../services/adService';

export interface ProcessorState {
  busy: boolean;
  /** 0..1 */
  progress: number;
  status: string;
  error: string | null;
}

const IDLE: ProcessorState = { busy: false, progress: 0, status: '', error: null };

/**
 * Drives any long-running document job: owns the progress/status/error state
 * the screens render, and closes every successful run through the ad gate
 * (a no-op in V1) so tool completions are consistent across the app.
 *
 * `run` never throws — it returns undefined on failure and puts the message in
 * `state.error`, because every caller here wants to show the message inline
 * rather than unwind.
 */
export function useDocumentProcessor() {
  const [state, setState] = useState<ProcessorState>(IDLE);
  // Guards against a late progress callback from an abandoned run overwriting
  // the state of a newer one.
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(IDLE);
  }, []);

  const onProgress = useCallback((runId: number) => {
    return ({ value, status }: ProgressReport) => {
      if (runId !== runIdRef.current) return;
      setState((prev) => ({ ...prev, progress: value, status }));
    };
  }, []);

  const run = useCallback(
    async <T,>(
      job: (progress: (report: ProgressReport) => void) => Promise<T>,
      opts: { initialStatus?: string; gateAds?: boolean } = {}
    ): Promise<T | undefined> => {
      runIdRef.current += 1;
      const runId = runIdRef.current;

      setState({
        busy: true,
        progress: 0,
        status: opts.initialStatus ?? 'Starting…',
        error: null,
      });

      try {
        const result = await job(onProgress(runId));
        if (runId !== runIdRef.current) return undefined;

        setState({ busy: false, progress: 1, status: 'Done', error: null });

        if (opts.gateAds !== false) {
          await showInterstitialIfReady();
        }
        return result;
      } catch (err) {
        if (runId !== runIdRef.current) return undefined;
        const message =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        setState({ busy: false, progress: 0, status: '', error: message });
        return undefined;
      }
    },
    [onProgress]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return { ...state, run, reset, clearError };
}

export default useDocumentProcessor;
