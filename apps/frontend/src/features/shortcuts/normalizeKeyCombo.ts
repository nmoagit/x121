/**
 * Normalize a KeyboardEvent into a consistent key combo string.
 *
 * Output format: `Ctrl+Shift+Alt+Meta+Key` (modifiers in fixed order).
 * Standalone modifiers (e.g. pressing only Shift) are ignored.
 *
 * Examples:
 *   - Space → "Space"
 *   - Ctrl+Z → "Ctrl+z"
 *   - Shift+ArrowRight → "Shift+ArrowRight"
 */

/** Set of keys that are modifiers themselves — never produce a combo alone. */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/**
 * Convert a `KeyboardEvent` to a normalised combo string.
 *
 * Returns `null` if only a modifier key was pressed.
 */
export function normalizeKeyCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) {
    return null;
  }

  const parts: string[] = [];

  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Normalise the key value.
  const key = normalizeKey(e.key);
  parts.push(key);

  return parts.join("+");
}

/** Map browser key names to our canonical names. */
function normalizeKey(key: string): string {
  switch (key) {
    case " ":
      return "Space";
    case "Escape":
      return "Escape";
    default:
      return key;
  }
}
