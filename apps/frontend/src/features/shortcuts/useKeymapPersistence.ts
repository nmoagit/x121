/**
 * Hook connecting the ShortcutRegistry to the backend keymap API (PRD-52).
 *
 * On mount: fetches the user's saved keymap and applies preset + overrides.
 * On change: persists updates via PUT.
 */

import { useCallback, useEffect, useRef } from "react";

import { api } from "@/lib/api";

import { shortcutRegistry } from "./ShortcutRegistry";

/* --------------------------------------------------------------------------
   API types
   -------------------------------------------------------------------------- */

interface UserKeymapResponse {
  id: number;
  user_id: number;
  active_preset: string;
  custom_bindings_json: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface UpsertKeymapPayload {
  active_preset?: string;
  custom_bindings_json?: Record<string, string>;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/**
 * Syncs the shortcut registry with the backend.
 *
 * Call once near the application root (alongside `useShortcutHandler`).
 */
export function useKeymapPersistence(): {
  /** Save the current preset + overrides to the backend. */
  persist: () => Promise<void>;
} {
  const loaded = useRef(false);

  // Load keymap on mount.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    api
      .get<UserKeymapResponse | undefined>("/user/keymap")
      .then((data) => {
        if (!data) return;
        shortcutRegistry.setPreset(data.active_preset);
        if (
          data.custom_bindings_json &&
          typeof data.custom_bindings_json === "object"
        ) {
          shortcutRegistry.setAllCustomOverrides(
            data.custom_bindings_json as Record<string, string>,
          );
        }
      })
      .catch(() => {
        // Silently fall back to default preset.
      });
  }, []);

  const persist = useCallback(async () => {
    const payload: UpsertKeymapPayload = {
      active_preset: shortcutRegistry.getActivePreset(),
      custom_bindings_json: shortcutRegistry.getCustomOverrides(),
    };
    await api.put<UserKeymapResponse>("/user/keymap", payload);
  }, []);

  return { persist };
}
