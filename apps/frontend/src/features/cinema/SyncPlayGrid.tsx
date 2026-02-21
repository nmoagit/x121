/**
 * Sync-Play Grid — synchronized comparison view (PRD-036 Phase 2).
 *
 * Supports 1x1, 2x1, and 2x2 layouts. Each cell contains a video player
 * element fed from the PRD-083 video streaming API. Global controls
 * synchronize all cells; per-cell controls allow mute and zoom.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Layout } from "@/tokens/icons";

import { getStreamUrl } from "@/features/video-player";

import { useSyncPlay } from "./useSyncPlay";
import { GridControls } from "./GridControls";
import { CinemaReviewControls } from "./CinemaReviewControls";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type GridLayout = "1x1" | "2x1" | "2x2";

export interface GridCell {
  segmentId: number;
  label: string;
}

interface SyncPlayGridProps {
  cells: GridCell[];
  layout: GridLayout;
  onCellAction: (cellIndex: number, action: "approve" | "reject" | "flag") => void;
  onLayoutChange?: (layout: GridLayout) => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const LAYOUT_OPTIONS: GridLayout[] = ["1x1", "2x1", "2x2"];

const LAYOUT_LABELS: Record<GridLayout, string> = {
  "1x1": "Single",
  "2x1": "Side by side",
  "2x2": "Quad",
};

const LAYOUT_GRID_CLASSES: Record<GridLayout, string> = {
  "1x1": "grid-cols-1 grid-rows-1",
  "2x1": "grid-cols-2 grid-rows-1",
  "2x2": "grid-cols-2 grid-rows-2",
};

const MAX_CELLS: Record<GridLayout, number> = {
  "1x1": 1,
  "2x1": 2,
  "2x2": 4,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SyncPlayGrid({
  cells,
  layout,
  onCellAction,
  onLayoutChange,
  className,
}: SyncPlayGridProps) {
  const [selectedCell, setSelectedCell] = useState(0);

  // Create persistent refs for each cell's video element (max 4 cells).
  const ref0 = useRef<HTMLVideoElement | null>(null);
  const ref1 = useRef<HTMLVideoElement | null>(null);
  const ref2 = useRef<HTMLVideoElement | null>(null);
  const ref3 = useRef<HTMLVideoElement | null>(null);
  const allRefs = useMemo(() => [ref0, ref1, ref2, ref3], []);

  const visibleCount = Math.min(cells.length, MAX_CELLS[layout]);
  const visibleCells = cells.slice(0, visibleCount);
  const visibleRefs = allRefs.slice(0, visibleCount);

  const sync = useSyncPlay(visibleRefs);

  const handleCellClick = useCallback((index: number) => {
    setSelectedCell(index);
  }, []);

  const handleCellAction = useCallback(
    (action: "approve" | "reject" | "flag") => {
      onCellAction(selectedCell, action);
    },
    [onCellAction, selectedCell],
  );

  // Drag & drop handling for rearranging cells.
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, _targetIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      // Drop handling is managed by the parent through onCellAction or
      // a dedicated onReorder callback. For now, we accept the drop event.
    },
    [],
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Layout switcher */}
      <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-[var(--spacing-1)]">
        <Layout size={16} className="text-[var(--color-text-muted)]" />
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onLayoutChange?.(opt)}
            className={cn(
              "px-[var(--spacing-2)] py-0.5 text-xs rounded-[var(--radius-sm)]",
              "transition-colors duration-[var(--duration-fast)]",
              layout === opt
                ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
            )}
            title={LAYOUT_LABELS[opt]}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Video grid */}
      <div
        data-testid="sync-grid"
        className={cn(
          "grid flex-1 gap-px bg-[var(--color-border-default)]",
          LAYOUT_GRID_CLASSES[layout],
        )}
      >
        {visibleCells.map((cell, index) => (
          <div
            key={`${cell.segmentId}-${index}`}
            className={cn(
              "relative bg-black overflow-hidden cursor-pointer",
              "transition-shadow duration-[var(--duration-fast)]",
              selectedCell === index && "ring-2 ring-[var(--color-action-primary)]",
              dragOverIndex === index && "ring-2 ring-[var(--color-action-warning)]",
            )}
            onClick={() => handleCellClick(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            {/* Video element */}
            <video
              ref={allRefs[index]}
              src={getStreamUrl("segment", cell.segmentId, "proxy")}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              muted={index > 0}
            />

            {/* Cell label overlay */}
            <div className="absolute top-[var(--spacing-1)] left-[var(--spacing-1)] px-[var(--spacing-1)] py-0.5 bg-black/60 rounded-[var(--radius-sm)] text-xs text-[var(--color-text-primary)]">
              {cell.label}
            </div>
          </div>
        ))}

        {/* Empty cell placeholders */}
        {Array.from({ length: MAX_CELLS[layout] - visibleCount }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center justify-center bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] text-sm"
          >
            Drop segment here
          </div>
        ))}
      </div>

      {/* Grid controls */}
      <GridControls
        sync={sync}
        cellCount={visibleCount}
        cellLabels={visibleCells.map((c) => c.label)}
        cellVideoRefs={visibleRefs}
        className="px-[var(--spacing-2)] py-[var(--spacing-1)] bg-[var(--color-surface-primary)]"
      />

      {/* Review controls for selected cell */}
      <div className="px-[var(--spacing-2)] py-[var(--spacing-1)] bg-[var(--color-surface-primary)] border-t border-[var(--color-border-default)]">
        <CinemaReviewControls
          onApprove={() => handleCellAction("approve")}
          onReject={() => handleCellAction("reject")}
          onFlag={() => handleCellAction("flag")}
          cellLabel={visibleCells[selectedCell]?.label}
        />
      </div>
    </div>
  );
}
