/**
 * Utilities for converting entity arrays to Select component option arrays.
 *
 * Eliminates the repeated `.map(x => ({ value: String(x.id), label: x.name }))` pattern.
 */

interface HasIdAndName {
  id: number;
  name: string;
}

/** Convert an array of entities with `id` and `name` to Select option format. */
export function toSelectOptions<T extends HasIdAndName>(
  items: T[] | undefined | null,
): { value: string; label: string }[] {
  return (items ?? []).map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
}

/**
 * Convert an array of entities to Select option format with a custom label function.
 *
 * Example: `toSelectOptionsBy(scenes, s => \`Scene #\${s.id}\`)`
 */
export function toSelectOptionsBy<T extends { id: number }>(
  items: T[] | undefined | null,
  labelFn: (item: T) => string,
): { value: string; label: string }[] {
  return (items ?? []).map((item) => ({
    value: String(item.id),
    label: labelFn(item),
  }));
}
