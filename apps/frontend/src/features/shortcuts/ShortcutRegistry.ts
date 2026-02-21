/**
 * Centralised keyboard shortcut registry (PRD-52).
 *
 * Manages binding registration, preset switching, custom overrides,
 * context-aware lookup, and conflict detection.
 */

import { presets } from "./presets";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type ShortcutCategory = "navigation" | "playback" | "review" | "generation" | "general";

export interface ShortcutBinding {
  /** Dot-separated action identifier, e.g. `playback.playPause`. */
  id: string;
  /** Key combo string, e.g. `Space`, `Ctrl+z`. */
  key: string;
  /** Human-readable label for display. */
  label: string;
  /** Grouping category. */
  category: ShortcutCategory;
  /** Panel scope. `null` or `undefined` = global binding. */
  context?: string | null;
  /** Callback to execute when the shortcut fires. */
  action: () => void;
}

/* --------------------------------------------------------------------------
   Registry
   -------------------------------------------------------------------------- */

export class ShortcutRegistry {
  private bindings = new Map<string, ShortcutBinding>();
  private activePreset = "default";
  private customOverrides = new Map<string, string>();

  /* -- Registration ------------------------------------------------------- */

  /** Register a shortcut binding. Overwrites any existing binding with same id. */
  register(binding: ShortcutBinding): void {
    this.bindings.set(binding.id, binding);
  }

  /** Remove a binding by action id. */
  unregister(id: string): void {
    this.bindings.delete(id);
  }

  /* -- Preset management -------------------------------------------------- */

  /** Switch the active preset. Keys fall back to preset defaults. */
  setPreset(preset: string): void {
    this.activePreset = preset;
  }

  /** Get the active preset name. */
  getActivePreset(): string {
    return this.activePreset;
  }

  /* -- Custom overrides --------------------------------------------------- */

  /** Override a single action's key binding. */
  setCustomBinding(actionId: string, key: string): void {
    this.customOverrides.set(actionId, key);
  }

  /** Remove a custom override, falling back to the preset default. */
  removeCustomBinding(actionId: string): void {
    this.customOverrides.delete(actionId);
  }

  /** Get all custom overrides as a plain object. */
  getCustomOverrides(): Record<string, string> {
    return Object.fromEntries(this.customOverrides);
  }

  /** Replace all custom overrides at once. */
  setAllCustomOverrides(overrides: Record<string, string>): void {
    this.customOverrides.clear();
    for (const [key, value] of Object.entries(overrides)) {
      this.customOverrides.set(key, value);
    }
  }

  /* -- Resolution --------------------------------------------------------- */

  /**
   * Resolve the effective key combo for an action.
   *
   * Priority: custom override > active preset > registered default.
   */
  getResolvedBinding(actionId: string): string {
    // 1. Custom override wins
    const custom = this.customOverrides.get(actionId);
    if (custom) return custom;

    // 2. Active preset
    const preset = presets[this.activePreset];
    if (preset?.[actionId]) return preset[actionId];

    // 3. Fall back to what was registered
    const binding = this.bindings.get(actionId);
    return binding?.key ?? "";
  }

  /* -- Lookup ------------------------------------------------------------- */

  /**
   * Find the binding whose resolved key matches a combo string,
   * optionally scoped to a context.
   */
  getShortcutForKey(key: string, context?: string | null): ShortcutBinding | null {
    for (const binding of this.bindings.values()) {
      const resolved = this.getResolvedBinding(binding.id);
      if (resolved !== key) continue;

      // Context match: exact context, or binding is global
      if (context && binding.context && binding.context !== context) continue;
      return binding;
    }
    return null;
  }

  /** Return all bindings, optionally filtered to a context (or global). */
  getAllBindings(context?: string | null): ShortcutBinding[] {
    const result: ShortcutBinding[] = [];
    for (const binding of this.bindings.values()) {
      if (context && binding.context && binding.context !== context) continue;
      result.push(binding);
    }
    return result;
  }

  /** Return bindings that would conflict with a given key+context. */
  getConflicts(key: string, context?: string | null): ShortcutBinding[] {
    const conflicts: ShortcutBinding[] = [];
    for (const binding of this.bindings.values()) {
      const resolved = this.getResolvedBinding(binding.id);
      if (resolved !== key) continue;
      if (context && binding.context && binding.context !== context) continue;
      conflicts.push(binding);
    }
    return conflicts;
  }

  /** Clear all bindings and overrides. */
  reset(): void {
    this.bindings.clear();
    this.customOverrides.clear();
    this.activePreset = "default";
  }
}

/** Singleton registry instance used application-wide. */
export const shortcutRegistry = new ShortcutRegistry();

/* --------------------------------------------------------------------------
   Category display constants & grouping utility
   -------------------------------------------------------------------------- */

/** Human-readable labels for each shortcut category. */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  navigation: "Navigation",
  playback: "Playback",
  review: "Review",
  generation: "Generation",
};

/** Canonical display order for shortcut categories. */
export const CATEGORY_ORDER: ShortcutCategory[] = [
  "general",
  "navigation",
  "playback",
  "review",
  "generation",
];

/**
 * Group an array of bindings by their category.
 *
 * @param bindings  - Bindings to group.
 * @param excludeIds - Optional set of binding IDs to skip.
 */
export function groupBindingsByCategory(
  bindings: ShortcutBinding[],
  excludeIds?: Set<string>,
): Map<ShortcutCategory, ShortcutBinding[]> {
  const grouped = new Map<ShortcutCategory, ShortcutBinding[]>();
  for (const binding of bindings) {
    if (excludeIds?.has(binding.id)) continue;
    const cat = binding.category;
    const list = grouped.get(cat) ?? [];
    list.push(binding);
    grouped.set(cat, list);
  }
  return grouped;
}
