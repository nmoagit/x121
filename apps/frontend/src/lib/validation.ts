/**
 * Shared validation utilities.
 */

/**
 * Returns `true` if `str` is valid JSON, `false` otherwise.
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a JSON string and return the result, or `null` if invalid.
 *
 * Useful when you need both validation and the parsed value (avoids parsing
 * twice compared to `isValidJson` + `JSON.parse`).
 */
export function parseJsonOrNull<T = unknown>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}
