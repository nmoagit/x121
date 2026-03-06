import { useCallback, useState } from "react";

/**
 * Manages a `Set<T>` state with a stable toggle callback.
 *
 * Toggles an item into or out of the set — adds it if absent, removes it if
 * present. The callback reference is stable across renders (wrapped in
 * useCallback) so it is safe to pass to memoised child components.
 *
 * @example
 * const [selected, toggleSelected, setSelected] = useSetToggle<number>();
 * // toggle an id
 * toggleSelected(42);
 * // reset
 * setSelected(new Set());
 */
export function useSetToggle<T>(
  initial?: Iterable<T>,
): [Set<T>, (item: T) => void, React.Dispatch<React.SetStateAction<Set<T>>>] {
  const [set, setSet] = useState<Set<T>>(() => new Set(initial));

  const toggle = useCallback((item: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  }, []);

  return [set, toggle, setSet];
}
