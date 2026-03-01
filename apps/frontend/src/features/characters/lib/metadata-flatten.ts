/**
 * Flatten / unflatten helpers for dot-notation metadata keys.
 *
 * Mirrors the Rust flatten_nested_metadata() / unflatten_metadata()
 * functions in core/src/metadata_editor.rs. Keep in sync.
 */

/**
 * Flatten nested metadata into dot-notation keys for form editing.
 *
 * `{ appearance: { hair: "brown" } }` becomes `{ "appearance.hair": "brown" }`.
 * Top-level scalar values are kept as-is.
 */
export function flattenMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [sub, subVal] of Object.entries(val as Record<string, unknown>)) {
        flat[`${key}.${sub}`] = subVal;
      }
    } else {
      flat[key] = val;
    }
  }
  return flat;
}

/**
 * Unflatten dot-notation keys back to nested JSON for storage.
 *
 * `{ "appearance.hair": "brown" }` becomes `{ appearance: { hair: "brown" } }`.
 * Keys without a dot are kept at top level.
 */
export function unflattenMetadata(flat: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flat)) {
    const dot = key.indexOf(".");
    if (dot !== -1) {
      const prefix = key.slice(0, dot);
      const suffix = key.slice(dot + 1);
      if (!result[prefix] || typeof result[prefix] !== "object") {
        result[prefix] = {};
      }
      (result[prefix] as Record<string, unknown>)[suffix] = val;
    } else {
      result[key] = val;
    }
  }
  return result;
}
