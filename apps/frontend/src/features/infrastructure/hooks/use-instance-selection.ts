/**
 * Multi-select state management for cloud instances (PRD-131).
 *
 * Built on top of the shared `useSetToggle` hook (DRY-731).
 */

import { useCallback } from "react";

import { useSetToggle } from "@/hooks/useSetToggle";

export function useInstanceSelection() {
  const [selectedIds, toggle, setSelectedIds] = useSetToggle<number>();

  const selectAll = useCallback(
    (ids: number[]) => {
      setSelectedIds(new Set(ids));
    },
    [setSelectedIds],
  );

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    selectAll,
    deselectAll,
    isSelected,
  };
}
