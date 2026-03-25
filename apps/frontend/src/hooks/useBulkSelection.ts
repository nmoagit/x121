import { useState, useCallback, useEffect, useMemo } from "react";

interface BulkSelectionState {
  /** Set of selected item IDs. */
  selectedIds: Set<number>;
  /** When true, ALL items matching current filters are selected (not just visible page). */
  selectAllMatching: boolean;
  /** Number of selected items (or total when selectAllMatching). */
  selectedCount: number;
}

interface BulkSelectionActions {
  /** Toggle a single item's selection. */
  toggle: (id: number) => void;
  /** Select all items on the current page. */
  selectPage: (ids: number[]) => void;
  /** Deselect all items on the current page. */
  deselectPage: (ids: number[]) => void;
  /** Mark all items matching current filters as selected. */
  selectAll: (total: number) => void;
  /** Clear the entire selection. */
  clearAll: () => void;
  /** Check if a specific item is selected. */
  isSelected: (id: number) => boolean;
  /** True when every ID in pageIds is selected. */
  isAllPageSelected: (pageIds: number[]) => boolean;
  /** True when some (but not all) pageIds are selected. */
  isIndeterminate: (pageIds: number[]) => boolean;
}

export type BulkSelection = BulkSelectionState & BulkSelectionActions;

/**
 * Manages bulk selection state for browse pages.
 *
 * @param resetKey - When this value changes, the selection is cleared.
 *   Typically a serialized filter state string so that changing filters
 *   resets the selection.
 */
export function useBulkSelection(resetKey?: string): BulkSelection {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [totalForSelectAll, setTotalForSelectAll] = useState(0);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setTotalForSelectAll(0);
  }, [resetKey]);

  const selectedCount = selectAllMatching ? totalForSelectAll : selectedIds.size;

  const toggle = useCallback((id: number) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectPage = useCallback((ids: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const deselectPage = useCallback((ids: number[]) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((total: number) => {
    setSelectAllMatching(true);
    setTotalForSelectAll(total);
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setTotalForSelectAll(0);
  }, []);

  const isSelected = useCallback(
    (id: number) => selectAllMatching || selectedIds.has(id),
    [selectAllMatching, selectedIds],
  );

  const isAllPageSelected = useCallback(
    (pageIds: number[]) => {
      if (pageIds.length === 0) return false;
      if (selectAllMatching) return true;
      return pageIds.every((id) => selectedIds.has(id));
    },
    [selectAllMatching, selectedIds],
  );

  const isIndeterminate = useCallback(
    (pageIds: number[]) => {
      if (selectAllMatching) return false;
      if (pageIds.length === 0) return false;
      const count = pageIds.filter((id) => selectedIds.has(id)).length;
      return count > 0 && count < pageIds.length;
    },
    [selectAllMatching, selectedIds],
  );

  return useMemo(
    () => ({
      selectedIds,
      selectAllMatching,
      selectedCount,
      toggle,
      selectPage,
      deselectPage,
      selectAll,
      clearAll,
      isSelected,
      isAllPageSelected,
      isIndeterminate,
    }),
    [selectedIds, selectAllMatching, selectedCount, toggle, selectPage, deselectPage, selectAll, clearAll, isSelected, isAllPageSelected, isIndeterminate],
  );
}
