/**
 * Shared hook for character group Select options.
 *
 * Returns a memoized options array suitable for the Select component,
 * with a "No group" placeholder prepended.
 *
 * Extracted from ProjectCharactersTab, CharacterDetailPage, and
 * ImportConfirmModal which all had identical groupOptions memos.
 */

import { useMemo } from "react";

import { toSelectOptions } from "@/lib/select-utils";

import { useCharacterGroups } from "./use-character-groups";

/**
 * Fetch character groups for a project and return Select-compatible options.
 *
 * @param projectId - The project whose groups to fetch.
 * @returns `{ options, groups, isLoading }` where `options` is
 *   `[{ value: "", label: "No group" }, ...toSelectOptions(groups)]`.
 */
export function useGroupSelectOptions(projectId: number) {
  const { data: groups, isLoading } = useCharacterGroups(projectId);

  const options = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  return { options, groups, isLoading };
}
