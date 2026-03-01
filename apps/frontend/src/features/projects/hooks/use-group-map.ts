/**
 * Shared hook for building a group lookup map.
 *
 * Returns a memoized `Map<number, CharacterGroup>` for O(1) lookups.
 *
 * Extracted from ProjectGroupsTab and ProjectCharactersTab which both
 * had identical groupMap useMemo blocks.
 */

import { useMemo } from "react";

import type { CharacterGroup } from "../types";

/**
 * Build a `Map<groupId, CharacterGroup>` from a groups array.
 *
 * @param groups - Array of character groups (may be undefined during loading).
 */
export function useGroupMap(groups: CharacterGroup[] | undefined) {
  return useMemo(() => {
    const map = new Map<number, CharacterGroup>();
    if (groups) {
      for (const g of groups) {
        map.set(g.id, g);
      }
    }
    return map;
  }, [groups]);
}
