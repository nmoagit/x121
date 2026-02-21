import { useCallback, useEffect, useRef } from "react";

import { api, ApiRequestError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ThemePreferencePayload {
  color_scheme: string;
  brand_palette: string;
  high_contrast: boolean;
  custom_theme_id: number | null;
}

interface ThemePreferenceResponse {
  id: number;
  user_id: number;
  color_scheme: string;
  brand_palette: string;
  high_contrast: boolean;
  custom_theme_id: number | null;
  created_at: string;
  updated_at: string;
}

interface ThemeState {
  colorScheme: string;
  brandPalette: string;
  highContrast: boolean;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/**
 * Hook that syncs theme preferences with the backend API.
 *
 * - On mount (if authenticated), loads the user's saved preference from the API.
 * - On theme change (if authenticated), persists to the API.
 * - Falls back silently on network errors -- localStorage remains the primary source.
 *
 * @param currentState   The current theme state from ThemeProvider.
 * @param onLoad         Callback invoked when a preference is loaded from the API.
 */
export function useThemePersistence(
  currentState: ThemeState,
  onLoad: (state: ThemeState) => void,
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // Track the last state we saved to avoid redundant writes.
  const lastSavedRef = useRef<string>("");

  /* ---- Load from API on mount / auth change ---- */
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function load() {
      try {
        const pref = await loadThemeFromAPI();
        if (cancelled || !pref) return;

        onLoadRef.current({
          colorScheme: pref.color_scheme,
          brandPalette: pref.brand_palette,
          highContrast: pref.high_contrast,
        });

        // Mark as already saved so we don't immediately write it back.
        lastSavedRef.current = JSON.stringify({
          color_scheme: pref.color_scheme,
          brand_palette: pref.brand_palette,
          high_contrast: pref.high_contrast,
        });
      } catch {
        // Network or 401 error -- silently fall back to localStorage.
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /* ---- Save to API on state change ---- */
  const saveToAPI = useCallback(
    async (state: ThemeState) => {
      if (!isAuthenticated) return;

      const payload: ThemePreferencePayload = {
        color_scheme: state.colorScheme,
        brand_palette: state.brandPalette,
        high_contrast: state.highContrast,
        custom_theme_id: null,
      };

      const key = JSON.stringify(payload);
      if (key === lastSavedRef.current) return;
      lastSavedRef.current = key;

      try {
        await saveThemeToAPI(payload);
      } catch {
        // Network error -- localStorage is the fallback, so silently ignore.
      }
    },
    [isAuthenticated],
  );

  // Debounce saves: only fire after the user has settled on a preference.
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isAuthenticated) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveToAPI(currentState);
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [currentState, isAuthenticated, saveToAPI]);
}

/* --------------------------------------------------------------------------
   API helpers
   -------------------------------------------------------------------------- */

/**
 * Load the user's theme preference from the backend.
 * Returns `null` if no preference has been saved yet (204 response).
 */
async function loadThemeFromAPI(): Promise<ThemePreferenceResponse | null> {
  try {
    return await api.get<ThemePreferenceResponse>("/user/theme");
  } catch (err) {
    // 204 No Content is returned as undefined by the api client
    if (err instanceof ApiRequestError && err.status === 204) {
      return null;
    }
    throw err;
  }
}

/**
 * Save the user's theme preference to the backend.
 */
async function saveThemeToAPI(payload: ThemePreferencePayload): Promise<void> {
  await api.put<unknown>("/user/theme", payload);
}
