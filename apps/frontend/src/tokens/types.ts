/** Color scheme axis: dark or light mode */
export type ColorScheme = "dark" | "light";

/** Brand palette axis: obsidian (muted, professional) or neon (vibrant, energetic) */
export type BrandPalette = "obsidian" | "neon";

/** Combined theme identifier — set as `data-theme` on the root element */
export type ThemeId = `${ColorScheme}-${BrandPalette}`;

/** All valid theme identifiers */
export const THEME_IDS: ThemeId[] = ["dark-obsidian", "dark-neon", "light-obsidian", "light-neon"];

/** Default theme applied on first visit (before system preference detection) */
export const DEFAULT_THEME: ThemeId = "dark-obsidian";

/** Default color scheme */
export const DEFAULT_COLOR_SCHEME: ColorScheme = "dark";

/** Default brand palette */
export const DEFAULT_BRAND_PALETTE: BrandPalette = "obsidian";

/** localStorage key for persisted theme preference */
export const THEME_STORAGE_KEY = "trulience-theme";
