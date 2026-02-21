/**
 * Shared hook that fires a callback when a click (mousedown) occurs
 * outside a given ref element.
 *
 * Extracted from 3 identical patterns (TagInput, Dropdown, JobTrayPanel).
 */

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Calls `onClickOutside` when the user clicks outside the element
 * referenced by `ref`.
 *
 * @param ref       - Ref to the container element.
 * @param onClickOutside - Callback invoked on outside click.
 * @param enabled   - When false, the listener is not attached (default true).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [ref, onClickOutside, enabled]);
}
