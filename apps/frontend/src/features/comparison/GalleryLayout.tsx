/**
 * Shared gallery layout for comparison views (PRD-68).
 *
 * Extracted from SceneGallery and AvatarAllScenes to eliminate
 * duplicated toolbar, sync-play, grid rendering, and empty/loading states.
 */

import { createRef, useMemo, type ReactNode } from "react";

import { ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { GridControls, useSyncPlay } from "@/features/cinema";

import type { ComparisonCell } from "./types";
import { GalleryCell } from "./GalleryCell";
import { GalleryControls } from "./GalleryControls";
import { useGalleryState } from "./hooks/useGalleryState";
import { useGalleryActions, type GalleryActions } from "./hooks/useGalleryActions";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GalleryLayoutProps {
  cells: ComparisonCell[];
  isLoading: boolean;
  /** Header rendered above the toolbar (optional). */
  header?: ReactNode;
  /** Which field from ComparisonCell to use as each cell's primary label. */
  cellLabelField?: "avatar_name" | "scene_type_name";
  /** React key field for each cell. */
  cellKeyField?: "avatar_id" | "scene_type_id";
  /** Empty state message. */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GalleryLayout({
  cells,
  isLoading,
  header,
  cellLabelField = "avatar_name",
  cellKeyField = "avatar_id",
  emptyTitle = "No scenes to compare",
  emptyDescription = "Generate scenes to see them here.",
  className,
}: GalleryLayoutProps) {
  const {
    sortedAndFilteredCells,
    sort,
    setSort,
    toggleDirection,
    filters,
    setFilters,
  } = useGalleryState(cells);

  const videoRefs = useMemo(
    () => sortedAndFilteredCells.map(() => createRef<HTMLVideoElement>()),
    [sortedAndFilteredCells.length],
  );

  const sync = useSyncPlay(videoRefs);
  const actions: GalleryActions = useGalleryActions();

  const cellLabels = sortedAndFilteredCells.map((c) => c[cellLabelField]);

  /* -- Render ------------------------------------------------------------- */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <ContextLoader size={64} />
      </div>
    );
  }

  if (sortedAndFilteredCells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-[var(--spacing-8)] text-[var(--color-text-muted)]">
        <p className="text-lg font-medium">{emptyTitle}</p>
        <p className="text-sm mt-[var(--spacing-1)]">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-[var(--spacing-4)]", className)}>
      {header}

      <GalleryControls
        sort={sort}
        onSortChange={setSort}
        onToggleDirection={toggleDirection}
        filters={filters}
        onFiltersChange={setFilters}
        onApproveAllPassing={() => actions.handleApproveAllPassing(sortedAndFilteredCells)}
        cellCount={sortedAndFilteredCells.length}
      />

      <GridControls
        sync={sync}
        cellCount={sortedAndFilteredCells.length}
        cellLabels={cellLabels}
        cellVideoRefs={videoRefs}
      />

      <div
        className="grid gap-[var(--spacing-4)]"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}
      >
        {sortedAndFilteredCells.map((cell, idx) => (
          <GalleryCell
            key={cell[cellKeyField]}
            cell={cell}
            primaryLabel={cellLabelField === "scene_type_name" ? cell.scene_type_name : undefined}
            videoRef={videoRefs[idx]}
            onApprove={cell.segment_id ? () => actions.handleApprove(cell.segment_id!) : undefined}
            onReject={cell.segment_id ? () => actions.handleReject(cell.segment_id!) : undefined}
            onFlag={cell.segment_id ? () => actions.handleFlag(cell.segment_id!) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
