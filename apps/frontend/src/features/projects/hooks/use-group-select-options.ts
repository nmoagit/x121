/**
 * Shared hook for avatar group Select options.
 *
 * Returns a memoized options array suitable for the Select component,
 * with a "No group" placeholder prepended.
 *
 * Extracted from ProjectAvatarsTab, AvatarDetailPage, and
 * ImportConfirmModal which all had identical groupOptions memos.
 */

import { useMemo } from "react";

import { toSelectOptions } from "@/lib/select-utils";

import { useAvatarGroups } from "./use-avatar-groups";

/**
 * Fetch avatar groups for a project and return Select-compatible options.
 *
 * @param projectId - The project whose groups to fetch.
 * @returns `{ options, groups, isLoading }` where `options` is
 *   `[{ value: "", label: "No group" }, ...toSelectOptions(groups)]`.
 */
export function useGroupSelectOptions(projectId: number) {
  const { data: groups, isLoading } = useAvatarGroups(projectId);

  const options = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  return { options, groups, isLoading };
}
