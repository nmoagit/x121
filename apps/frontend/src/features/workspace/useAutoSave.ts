/**
 * Debounced auto-save hook for workspace state (PRD-04).
 *
 * When the workspace store is dirty, waits for `debounceMs` (default 2s)
 * of inactivity before saving. Also triggers an immediate save on
 * `beforeunload` to capture last-second changes.
 */

import { useCallback, useEffect, useRef } from "react";

import { detectDeviceType } from "./deviceDetection";
import { useUpdateWorkspace, useWorkspaceStore } from "./hooks/use-workspace";

/** Default debounce interval in milliseconds. */
const DEFAULT_DEBOUNCE_MS = 2000;

export function useAutoSave(debounceMs: number = DEFAULT_DEBOUNCE_MS) {
  const isDirty = useWorkspaceStore((s) => s.isDirty);
  const layout = useWorkspaceStore((s) => s.layout);
  const navigation = useWorkspaceStore((s) => s.navigation);
  const preferences = useWorkspaceStore((s) => s.preferences);
  const markClean = useWorkspaceStore((s) => s.markClean);

  const updateWorkspace = useUpdateWorkspace();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceTypeRef = useRef(detectDeviceType());

  const save = useCallback(() => {
    updateWorkspace.mutate({
      layout_state: layout,
      navigation_state: navigation,
      preferences,
    });
  }, [layout, navigation, preferences, updateWorkspace]);

  // Debounced save on dirty state.
  useEffect(() => {
    if (!isDirty) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      save();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isDirty, debounceMs, save]);

  // Immediate save on page unload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useWorkspaceStore.getState().isDirty) {
        const state = useWorkspaceStore.getState();
        // Use sendBeacon for reliable last-chance save.
        const deviceType = deviceTypeRef.current;
        const body = JSON.stringify({
          layout_state: state.layout,
          navigation_state: state.navigation,
          preferences: state.preferences,
        });
        navigator.sendBeacon?.(
          `/api/v1/workspace?device_type=${deviceType}`,
          new Blob([body], { type: "application/json" }),
        );
        markClean();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [markClean]);
}
