/**
 * Conditional class name merger.
 *
 * Filters out falsy values and joins remaining class strings with a space.
 * Intentionally lightweight — no dependency on clsx or tailwind-merge.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
