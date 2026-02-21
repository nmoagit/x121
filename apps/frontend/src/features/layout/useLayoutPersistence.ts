/**
 * Layout persistence hook (PRD-30).
 *
 * Connects the layout Zustand store to the backend API.
 * - Fetches user layouts on mount
 * - Auto-saves layout changes with debouncing
 * - Provides save/load/delete operations
 */

import { api } from "@/lib/api";
import { useCallback, useEffect, useRef } from "react";
import type { PanelState } from "./types";
import { useLayoutStore } from "./useLayoutStore";

/* --------------------------------------------------------------------------
   API response types
   -------------------------------------------------------------------------- */

interface UserLayoutDto {
  id: number;
  user_id: number;
  layout_name: string;
  layout_json: PanelState[];
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Debounce delay for auto-save (ms). */
const AUTO_SAVE_DELAY_MS = 2000;

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

interface UseLayoutPersistenceOptions {
  /** Whether auto-save is enabled. Defaults to `true`. */
  autoSave?: boolean;
}

export function useLayoutPersistence(options: UseLayoutPersistenceOptions = {}) {
  const { autoSave = true } = options;

  const panels = useLayoutStore((s) => s.panels);
  const activeMeta = useLayoutStore((s) => s.activeMeta);
  const dirty = useLayoutStore((s) => s.dirty);
  const setPanels = useLayoutStore((s) => s.setPanels);
  const markSaved = useLayoutStore((s) => s.markSaved);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Fetch the user's layouts and load the default one. */
  const fetchLayouts = useCallback(async () => {
    const layouts = await api.get<UserLayoutDto[]>("/user/layouts");
    const defaultLayout = layouts.find((l) => l.is_default) ?? layouts[0];

    if (defaultLayout) {
      setPanels(defaultLayout.layout_json, {
        id: defaultLayout.id,
        name: defaultLayout.layout_name,
      });
    }

    return layouts;
  }, [setPanels]);

  /** Save or update the current layout. */
  const saveLayout = useCallback(
    async (name?: string) => {
      const layoutName = name ?? activeMeta.name;

      if (activeMeta.id) {
        // Update existing
        await api.put<UserLayoutDto>(`/user/layouts/${activeMeta.id}`, {
          layout_name: layoutName,
          layout_json: panels,
        });
        markSaved(activeMeta.id, layoutName);
      } else {
        // Create new
        const created = await api.post<UserLayoutDto>("/user/layouts", {
          layout_name: layoutName,
          layout_json: panels,
          is_default: true,
        });
        markSaved(created.id, created.layout_name);
      }
    },
    [panels, activeMeta, markSaved],
  );

  /** Load a specific layout by ID. */
  const loadLayout = useCallback(
    async (layoutId: number) => {
      const layout = await api.get<UserLayoutDto>(`/user/layouts/${layoutId}`);
      setPanels(layout.layout_json, {
        id: layout.id,
        name: layout.layout_name,
      });
    },
    [setPanels],
  );

  /** Delete a layout by ID. */
  const deleteLayout = useCallback(async (layoutId: number) => {
    await api.delete(`/user/layouts/${layoutId}`);
  }, []);

  // Load layouts on mount
  useEffect(() => {
    void fetchLayouts();
  }, [fetchLayouts]);

  // Auto-save on change (debounced)
  useEffect(() => {
    if (!autoSave || !dirty || !activeMeta.id) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void saveLayout();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoSave, dirty, activeMeta.id, saveLayout]);

  return {
    fetchLayouts,
    saveLayout,
    loadLayout,
    deleteLayout,
  };
}
