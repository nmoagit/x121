/**
 * Auto-advance hook for the review workflow (PRD-35).
 *
 * After a segment decision (approve/reject/flag), automatically advances
 * to the next unreviewed segment after a configurable delay.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AUTO_ADVANCE_DELAY_MS } from "../types";

interface UseAutoAdvanceOptions {
  /** Delay in milliseconds before auto-advancing. Defaults to 500ms. */
  delay?: number;
  /** Callback to load the next unreviewed segment. */
  onAdvance: () => void;
  /** Whether auto-advance is enabled. Defaults to true. */
  enabled?: boolean;
}

interface UseAutoAdvanceReturn {
  /** Trigger the auto-advance countdown. Call after a decision is made. */
  trigger: () => void;
  /** Cancel a pending auto-advance. */
  cancel: () => void;
  /** Whether an auto-advance is currently pending. */
  isPending: boolean;
}

/**
 * Provides auto-advance functionality for the review workflow.
 *
 * After calling `trigger()`, waits `delay` ms then calls `onAdvance()`.
 * The countdown can be cancelled at any time.
 */
export function useAutoAdvance({
  delay = AUTO_ADVANCE_DELAY_MS,
  onAdvance,
  enabled = true,
}: UseAutoAdvanceOptions): UseAutoAdvanceReturn {
  const [isPending, setIsPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsPending(false);
  }, []);

  const trigger = useCallback(() => {
    if (!enabled) return;

    // Cancel any existing timer before starting a new one.
    cancel();

    setIsPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsPending(false);
      onAdvance();
    }, delay);
  }, [enabled, delay, onAdvance, cancel]);

  // Clean up timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { trigger, cancel, isPending };
}
