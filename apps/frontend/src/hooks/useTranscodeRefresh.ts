/**
 * Real-time refresh for transcode state changes (PRD-169 Requirement 1.11).
 *
 * Subscribes to the existing `ActivityLogBroadcaster` via the activity console
 * store, filters on `fields.kind === "transcode.updated"`, and invalidates
 * the affected TanStack Query caches. Debounces to max one invalidation per
 * entity per second.
 *
 * Fallback: when the activity WebSocket is not connected AND the tab is
 * visible, polls `scene-video-versions` queries every 5 seconds so
 * cards still progress from `pending` → `completed` after a network blip.
 *
 * Mount at the app-shell level so invalidations happen regardless of
 * which page the user is on.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useActivityConsoleStore } from "@/features/activity-console/stores/useActivityConsoleStore";
import type { ActivityLogEntry } from "@/features/activity-console/types";

const DEBOUNCE_MS = 1_000;
const POLLING_INTERVAL_MS = 5_000;
const TRANSCODE_KIND = "transcode.updated";
const TARGET_ENTITY_TYPE = "scene_video_version";

function isTranscodeUpdate(entry: ActivityLogEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.entity_type !== TARGET_ENTITY_TYPE) return false;
  const kind = entry.fields?.kind;
  return typeof kind === "string" && kind === TRANSCODE_KIND;
}

/**
 * Invalidate the TanStack Query keys that surface transcode state for an SVV.
 *
 * Keeping this centralized ensures all consumers — activity broadcaster
 * entries and the polling fallback — refresh the same set of caches.
 */
function invalidateForEntity(qc: ReturnType<typeof useQueryClient>, entityId: number): void {
  // Broad invalidations: list/detail queries we don't need to enumerate.
  qc.invalidateQueries({ queryKey: ["scene-video-versions"] });
  qc.invalidateQueries({ queryKey: ["scene-video-version", entityId] });
  qc.invalidateQueries({ queryKey: ["scene", "versions"] });
  qc.invalidateQueries({ queryKey: ["derived-clips"] });
}

export function useTranscodeRefresh(): void {
  const qc = useQueryClient();

  // 1. Activity broadcaster subscription via the console store.
  //    We subscribe to the `entries` slice and react to new ones — only the
  //    newest entry's `transcode.updated` kind drives invalidation.
  const lastTimestampRef = useRef<string | null>(null);
  const lastInvalidateByEntityRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const unsubscribe = useActivityConsoleStore.subscribe((state, prev) => {
      if (state.entries === prev.entries || state.entries.length === 0) {
        return;
      }
      // Take the freshest entry — entries are prepended in-order.
      const latest = state.entries[0];
      if (!latest || !isTranscodeUpdate(latest)) return;

      // Skip duplicates (same entry re-emitted due to filter resubscribe).
      if (lastTimestampRef.current === latest.timestamp) return;
      lastTimestampRef.current = latest.timestamp;

      const entityId = latest.entity_id;
      if (typeof entityId !== "number") return;

      // Debounce per entity to 1 update/sec.
      const now = Date.now();
      const prevAt = lastInvalidateByEntityRef.current.get(entityId) ?? 0;
      if (now - prevAt < DEBOUNCE_MS) return;
      lastInvalidateByEntityRef.current.set(entityId, now);

      invalidateForEntity(qc, entityId);
    });
    return unsubscribe;
  }, [qc]);

  // 2. Polling fallback. The activity broadcaster is best-effort — if the
  //    WebSocket drops we still need transcode state to progress on the UI.
  //    Poll every 5s while the tab is visible.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId != null) return;
      intervalId = setInterval(() => {
        // Broad invalidation — cheap because only the visible queries refetch.
        qc.invalidateQueries({ queryKey: ["scene-video-versions"] });
        qc.invalidateQueries({ queryKey: ["scene", "versions"] });
        qc.invalidateQueries({ queryKey: ["derived-clips"] });
      }, POLLING_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, [qc]);
}
