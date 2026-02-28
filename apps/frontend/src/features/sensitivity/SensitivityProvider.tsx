/**
 * Sensitivity context provider (PRD-82).
 *
 * Manages blur levels, screen-share mode, watermark settings, and
 * view-specific overrides. Uses localStorage as primary storage with
 * API sync when authenticated.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

import type { BlurLevel, UserSensitivitySettings } from "./types";
import { BLUR_LEVELS, SENSITIVITY_STORAGE_KEY } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SensitivityState {
  globalLevel: BlurLevel;
  viewOverrides: Record<string, BlurLevel>;
  watermarkEnabled: boolean;
  watermarkText: string | null;
  watermarkPosition: "center" | "corner";
  watermarkOpacity: number;
  screenShareMode: boolean;
}

export interface SensitivityContextValue extends SensitivityState {
  /** Admin minimum level */
  adminMinLevel: BlurLevel;
  /** Get the effective blur level for a specific view */
  getViewLevel: (viewName: string) => BlurLevel;
  /** Update the global blur level */
  setGlobalLevel: (level: BlurLevel) => void;
  /** Set a view-specific override */
  setViewOverride: (viewName: string, level: BlurLevel) => void;
  /** Toggle screen-share mode on/off */
  toggleScreenShareMode: () => void;
}

interface SensitivityProviderProps {
  children: ReactNode;
  /** Admin minimum level override (default: "full") */
  adminMinLevel?: BlurLevel;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const DEFAULT_STATE: SensitivityState = {
  globalLevel: "full",
  viewOverrides: {},
  watermarkEnabled: false,
  watermarkText: null,
  watermarkPosition: "center",
  watermarkOpacity: 0.3,
  screenShareMode: false,
};

/**
 * Return the more restrictive of two blur levels.
 * Higher index in BLUR_LEVELS = more restrictive.
 */
export function maxBlurLevel(a: BlurLevel, b: BlurLevel): BlurLevel {
  const idxA = BLUR_LEVELS.indexOf(a);
  const idxB = BLUR_LEVELS.indexOf(b);
  return idxA >= idxB ? a : b;
}

function loadStoredSettings(): SensitivityState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    if (
      typeof obj.globalLevel === "string" &&
      BLUR_LEVELS.includes(obj.globalLevel as BlurLevel)
    ) {
      return {
        globalLevel: obj.globalLevel as BlurLevel,
        viewOverrides: (typeof obj.viewOverrides === "object" && obj.viewOverrides !== null
          ? obj.viewOverrides
          : {}) as Record<string, BlurLevel>,
        watermarkEnabled: typeof obj.watermarkEnabled === "boolean" ? obj.watermarkEnabled : false,
        watermarkText: typeof obj.watermarkText === "string" ? obj.watermarkText : null,
        watermarkPosition:
          obj.watermarkPosition === "center" || obj.watermarkPosition === "corner"
            ? obj.watermarkPosition
            : "center",
        watermarkOpacity: typeof obj.watermarkOpacity === "number" ? obj.watermarkOpacity : 0.3,
        screenShareMode: typeof obj.screenShareMode === "boolean" ? obj.screenShareMode : false,
      };
    }
  } catch {
    /* corrupted storage -- fall through */
  }

  return null;
}

function saveSettings(state: SensitivityState): void {
  try {
    localStorage.setItem(SENSITIVITY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or unavailable -- silently ignore */
  }
}

/* --------------------------------------------------------------------------
   Context
   -------------------------------------------------------------------------- */

const SensitivityContext = createContext<SensitivityContextValue | null>(null);

/* --------------------------------------------------------------------------
   Provider
   -------------------------------------------------------------------------- */

function SensitivityProvider({
  children,
  adminMinLevel = "full",
}: SensitivityProviderProps) {
  const [state, setState] = useState<SensitivityState>(() => {
    return loadStoredSettings() ?? DEFAULT_STATE;
  });

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const lastSavedRef = useRef<string>("");

  /* ---- Persist to localStorage on every change ---- */
  useEffect(() => {
    saveSettings(state);
  }, [state]);

  /* ---- Load from API when authenticated ---- */
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function load() {
      try {
        const settings = await api.get<UserSensitivitySettings>("/user/sensitivity");
        if (cancelled || !settings) return;

        const loaded: SensitivityState = {
          globalLevel: settings.global_level,
          viewOverrides: settings.view_overrides_json,
          watermarkEnabled: settings.watermark_enabled,
          watermarkText: settings.watermark_text,
          watermarkPosition: settings.watermark_position,
          watermarkOpacity: settings.watermark_opacity,
          screenShareMode: settings.screen_share_mode,
        };

        setState(loaded);

        lastSavedRef.current = JSON.stringify(loaded);
      } catch {
        /* Network error -- localStorage is the fallback */
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /* ---- Save to API on state change (debounced) ---- */
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isAuthenticated) return;

    const key = JSON.stringify(state);
    if (key === lastSavedRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = key;
      api.put("/user/sensitivity", {
        global_level: state.globalLevel,
        view_overrides_json: state.viewOverrides,
        watermark_enabled: state.watermarkEnabled,
        watermark_text: state.watermarkText,
        watermark_position: state.watermarkPosition,
        watermark_opacity: state.watermarkOpacity,
        screen_share_mode: state.screenShareMode,
        sound_enabled: true,
      }).catch(() => {
        /* Network error -- silently ignore, localStorage is primary */
      });
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [state, isAuthenticated]);

  /* ---- Callbacks ---- */
  const getViewLevel = useCallback(
    (viewName: string): BlurLevel => {
      if (state.screenShareMode) return "placeholder";

      const override = state.viewOverrides[viewName];
      if (override) return maxBlurLevel(override, adminMinLevel);

      return maxBlurLevel(state.globalLevel, adminMinLevel);
    },
    [state.screenShareMode, state.viewOverrides, state.globalLevel, adminMinLevel],
  );

  const setGlobalLevel = useCallback((level: BlurLevel) => {
    setState((prev) => ({ ...prev, globalLevel: level }));
  }, []);

  const setViewOverride = useCallback((viewName: string, level: BlurLevel) => {
    setState((prev) => ({
      ...prev,
      viewOverrides: { ...prev.viewOverrides, [viewName]: level },
    }));
  }, []);

  const toggleScreenShareMode = useCallback(() => {
    setState((prev) => ({ ...prev, screenShareMode: !prev.screenShareMode }));
  }, []);

  /* ---- Context value ---- */
  const value = useMemo<SensitivityContextValue>(
    () => ({
      ...state,
      adminMinLevel,
      getViewLevel,
      setGlobalLevel,
      setViewOverride,
      toggleScreenShareMode,
    }),
    [state, adminMinLevel, getViewLevel, setGlobalLevel, setViewOverride, toggleScreenShareMode],
  );

  return (
    <SensitivityContext.Provider value={value}>
      {children}
    </SensitivityContext.Provider>
  );
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

function useSensitivity(): SensitivityContextValue {
  const ctx = useContext(SensitivityContext);
  if (!ctx) {
    throw new Error("useSensitivity must be used within a <SensitivityProvider>");
  }
  return ctx;
}

export { SensitivityProvider, useSensitivity };
export type { SensitivityProviderProps };
