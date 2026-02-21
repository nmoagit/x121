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

import { useThemePersistence } from "@/hooks/useThemePersistence";
import { DEFAULT_BRAND_PALETTE, DEFAULT_COLOR_SCHEME, THEME_STORAGE_KEY } from "@/tokens/types";
import type { BrandPalette, ColorScheme, ThemeId } from "@/tokens/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ThemeState {
  colorScheme: ColorScheme;
  brandPalette: BrandPalette;
  highContrast: boolean;
}

interface ThemeContextValue extends ThemeState {
  /** Computed theme identifier, e.g. "dark-obsidian" */
  themeId: ThemeId;
  setColorScheme: (scheme: ColorScheme) => void;
  setBrandPalette: (palette: BrandPalette) => void;
  setHighContrast: (enabled: boolean) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Initial color scheme override (ignored if user has stored preference) */
  colorScheme?: ColorScheme;
  /** Initial brand palette override (ignored if user has stored preference) */
  brandPalette?: BrandPalette;
  /** Initial high-contrast override (ignored if user has stored preference) */
  highContrast?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function buildThemeId(scheme: ColorScheme, palette: BrandPalette): ThemeId {
  return `${scheme}-${palette}`;
}

/** Detect system-level color scheme preference */
function getSystemColorScheme(): ColorScheme {
  if (typeof window === "undefined") return DEFAULT_COLOR_SCHEME;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

interface StoredPreference {
  colorScheme: ColorScheme;
  brandPalette: BrandPalette;
  highContrast: boolean;
}

function loadStoredPreference(): StoredPreference | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    const validSchemes: ColorScheme[] = ["dark", "light"];
    const validPalettes: BrandPalette[] = ["obsidian", "neon"];

    if (
      typeof obj.colorScheme === "string" &&
      validSchemes.includes(obj.colorScheme as ColorScheme) &&
      typeof obj.brandPalette === "string" &&
      validPalettes.includes(obj.brandPalette as BrandPalette) &&
      typeof obj.highContrast === "boolean"
    ) {
      return {
        colorScheme: obj.colorScheme as ColorScheme,
        brandPalette: obj.brandPalette as BrandPalette,
        highContrast: obj.highContrast,
      };
    }
  } catch {
    /* corrupted storage — fall through to null */
  }

  return null;
}

function savePreference(state: ThemeState): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or unavailable — silently ignore */
  }
}

/** Apply theme attributes to the document root element (no React re-render) */
function applyThemeToDOM(state: ThemeState): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", buildThemeId(state.colorScheme, state.brandPalette));
  root.setAttribute("data-high-contrast", String(state.highContrast));
}

/* --------------------------------------------------------------------------
   Context
   -------------------------------------------------------------------------- */

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* --------------------------------------------------------------------------
   Provider
   -------------------------------------------------------------------------- */

function ThemeProvider({
  children,
  colorScheme: initialScheme,
  brandPalette: initialPalette,
  highContrast: initialHighContrast,
}: ThemeProviderProps) {
  const [state, setState] = useState<ThemeState>(() => {
    const stored = loadStoredPreference();
    if (stored) return stored;

    return {
      colorScheme: initialScheme ?? getSystemColorScheme(),
      brandPalette: initialPalette ?? DEFAULT_BRAND_PALETTE,
      highContrast: initialHighContrast ?? false,
    };
  });

  /* Keep a ref so DOM updates happen synchronously in callbacks */
  const stateRef = useRef(state);
  stateRef.current = state;

  /* Apply theme to DOM on mount and whenever state changes */
  useEffect(() => {
    applyThemeToDOM(state);
    savePreference(state);
  }, [state]);

  /* Listen for system color scheme changes */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: light)");

    const handler = (e: MediaQueryListEvent) => {
      /* Only auto-switch if the user hasn't explicitly stored a preference */
      const stored = loadStoredPreference();
      if (!stored) {
        const scheme: ColorScheme = e.matches ? "light" : "dark";
        setState((prev) => ({ ...prev, colorScheme: scheme }));
      }
    };

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  /* Sync with backend API when authenticated (PRD-29 Phase 8.1) */
  const handleAPILoad = useCallback((loaded: { colorScheme: string; brandPalette: string; highContrast: boolean }) => {
    setState({
      colorScheme: loaded.colorScheme as ColorScheme,
      brandPalette: loaded.brandPalette as BrandPalette,
      highContrast: loaded.highContrast,
    });
  }, []);

  useThemePersistence(state, handleAPILoad);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setState((prev) => ({ ...prev, colorScheme: scheme }));
  }, []);

  const setBrandPalette = useCallback((palette: BrandPalette) => {
    setState((prev) => ({ ...prev, brandPalette: palette }));
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, highContrast: enabled }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      themeId: buildThemeId(state.colorScheme, state.brandPalette),
      setColorScheme,
      setBrandPalette,
      setHighContrast,
    }),
    [state, setColorScheme, setBrandPalette, setHighContrast],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}

export { ThemeProvider, useTheme };
export type { ThemeContextValue, ThemeProviderProps };
