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
