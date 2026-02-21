import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type ProficiencyLevel = "beginner" | "intermediate" | "expert";

interface ProficiencyRecord {
  feature_area: string;
  proficiency_level: ProficiencyLevel;
  usage_count: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Minimum interval between debounced API calls (ms). */
const DEBOUNCE_MS = 2_000;

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/**
 * Tracks and queries proficiency for a specific feature area (PRD-32).
 *
 * - Fetches the current proficiency record on mount.
 * - Exposes a debounced `recordUsage()` that POSTs to the API.
 * - Returns the current `proficiency` level (defaults to "beginner").
 */
export function useProficiencyTracker(featureArea: string) {
  const [proficiency, setProficiency] =
    useState<ProficiencyLevel>("beginner");
  const [isLoading, setIsLoading] = useState(true);

  // Debounce timer ref.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending usage count that has not yet been flushed.
  const pendingRef = useRef(0);

  // Fetch current proficiency on mount.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const records = await api.get<ProficiencyRecord[]>(
          "/user/proficiency",
        );
        if (cancelled) return;
        const record = records.find((r) => r.feature_area === featureArea);
        if (record) {
          setProficiency(record.proficiency_level);
        }
      } catch {
        // Non-critical: default to beginner.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [featureArea]);

  // Flush pending usage to the API.
  const flush = useCallback(async () => {
    if (pendingRef.current <= 0) return;
    const count = pendingRef.current;
    pendingRef.current = 0;

    try {
      // Fire one request per accumulated usage event.
      // The backend increments atomically, so parallel calls are safe.
      for (let i = 0; i < count; i++) {
        const result = await api.post<ProficiencyRecord>(
          "/user/proficiency/record-usage",
          { feature_area: featureArea },
        );
        setProficiency(result.proficiency_level);
      }
    } catch {
      // Non-critical: silently degrade.
    }
  }, [featureArea]);

  /** Record a single usage event (debounced). */
  const recordUsage = useCallback(() => {
    pendingRef.current += 1;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);

  // Clean up timer on unmount and flush any pending events.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      // Fire-and-forget final flush.
      if (pendingRef.current > 0) {
        void flush();
      }
    };
  }, [flush]);

  return { proficiency, isLoading, recordUsage };
}
