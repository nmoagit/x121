/**
 * Gallery sort, filter, and mute state management (PRD-68).
 *
 * Encapsulates all UI state for the comparison gallery so that
 * SceneGallery and CharacterAllScenes stay lean.
 */

import { useMemo, useState } from "react";

import type {
  ComparisonCell,
  GalleryFilters,
  GallerySort,
  SortDirection,
  SortField,
} from "../types";

/* --------------------------------------------------------------------------
   Sort comparators
   -------------------------------------------------------------------------- */

const SORT_FNS: Record<SortField, (a: ComparisonCell, b: ComparisonCell) => number> = {
  character_name: (a, b) => a.character_name.localeCompare(b.character_name),
  qa_score: (a, b) => (a.qa_score ?? -1) - (b.qa_score ?? -1),
  created_at: (a, b) => a.created_at.localeCompare(b.created_at),
  approval_status: (a, b) =>
    (a.approval_status ?? "").localeCompare(b.approval_status ?? ""),
};

/* --------------------------------------------------------------------------
   Filter predicate
   -------------------------------------------------------------------------- */

function matchesFilter(cell: ComparisonCell, filters: GalleryFilters): boolean {
  if (!filters.status) return true;

  if (filters.status === "unapproved") {
    return cell.approval_status === null;
  }

  return cell.approval_status === filters.status;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export interface GalleryStateResult {
  sortedAndFilteredCells: ComparisonCell[];
  sort: GallerySort;
  setSort: (sort: GallerySort) => void;
  toggleDirection: () => void;
  filters: GalleryFilters;
  setFilters: (filters: GalleryFilters) => void;
  muteState: Record<number, boolean>;
  toggleMute: (segmentId: number) => void;
}

export function useGalleryState(cells: ComparisonCell[]): GalleryStateResult {
  const [sort, setSort] = useState<GallerySort>({
    field: "character_name",
    direction: "asc",
  });

  const [filters, setFilters] = useState<GalleryFilters>({});
  const [muteState, setMuteState] = useState<Record<number, boolean>>({});

  const toggleDirection = () => {
    setSort((prev) => ({
      ...prev,
      direction: (prev.direction === "asc" ? "desc" : "asc") as SortDirection,
    }));
  };

  const toggleMute = (segmentId: number) => {
    setMuteState((prev) => ({ ...prev, [segmentId]: !prev[segmentId] }));
  };

  const sortedAndFilteredCells = useMemo(() => {
    const filtered = cells.filter((cell) => matchesFilter(cell, filters));

    const sortFn = SORT_FNS[sort.field];
    const sorted = [...filtered].sort(sortFn);

    if (sort.direction === "desc") {
      sorted.reverse();
    }

    return sorted;
  }, [cells, sort, filters]);

  return {
    sortedAndFilteredCells,
    sort,
    setSort,
    toggleDirection,
    filters,
    setFilters,
    muteState,
    toggleMute,
  };
}
