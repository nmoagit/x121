/**
 * Shared hook for building a group lookup map.
 *
 * Returns a memoized `Map<number, AvatarGroup>` for O(1) lookups.
 *
 * Extracted from ProjectGroupsTab and ProjectAvatarsTab which both
 * had identical groupMap useMemo blocks.
 */

import { useMemo } from "react";

import type { AvatarGroup } from "../types";

/**
 * Build a `Map<groupId, AvatarGroup>` from a groups array.
 *
 * @param groups - Array of avatar groups (may be undefined during loading).
 */
export function useGroupMap(groups: AvatarGroup[] | undefined) {
  return useMemo(() => {
    const map = new Map<number, AvatarGroup>();
    if (groups) {
      for (const g of groups) {
        map.set(g.id, g);
      }
    }
    return map;
  }, [groups]);
}
