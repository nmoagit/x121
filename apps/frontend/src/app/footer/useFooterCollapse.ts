/**
 * Persists footer collapse state in localStorage.
 *
 * Default: expanded (collapsed = false).
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "an2n:footer-collapsed";

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useFooterCollapse(): [collapsed: boolean, setCollapsed: (v: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(readInitial);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable — state still works in-memory.
    }
  }, []);

  return [collapsed, setCollapsed];
}
