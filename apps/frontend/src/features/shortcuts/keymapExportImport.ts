/**
 * Keymap export/import utilities (PRD-52).
 *
 * - `exportKeymap` downloads a JSON file with the user's resolved bindings.
 * - `importKeymap` reads a file and returns the parsed overrides.
 */

import { shortcutRegistry } from "./ShortcutRegistry";

/* --------------------------------------------------------------------------
   Export
   -------------------------------------------------------------------------- */

/** Download the current keymap as a `.json` file. */
export function exportKeymap(): void {
  const allBindings = shortcutRegistry.getAllBindings();
  const resolved: Record<string, string> = {};

  for (const binding of allBindings) {
    resolved[binding.id] = shortcutRegistry.getResolvedBinding(binding.id);
  }

  const payload = {
    preset: shortcutRegistry.getActivePreset(),
    custom_overrides: shortcutRegistry.getCustomOverrides(),
    resolved_bindings: resolved,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trulience-keymap.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------------------
   Import
   -------------------------------------------------------------------------- */

interface ImportedKeymap {
  preset?: string;
  custom_overrides?: Record<string, string>;
  resolved_bindings?: Record<string, string>;
}

/**
 * Parse a keymap JSON file and return the custom overrides.
 *
 * Accepts files produced by `exportKeymap`, or any plain `{ action: key }`
 * mapping.
 */
export async function importKeymap(
  file: File,
): Promise<Record<string, string>> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid keymap file: expected a JSON object");
  }

  const data = parsed as ImportedKeymap;

  // If the file has our export structure, use custom_overrides.
  if (data.custom_overrides && typeof data.custom_overrides === "object") {
    return data.custom_overrides;
  }

  // Otherwise treat the whole object as action→key pairs.
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
