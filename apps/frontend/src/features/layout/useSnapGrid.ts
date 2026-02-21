/**
 * Snap-to-grid positioning hook (PRD-30).
 *
 * Provides a function that snaps arbitrary coordinates to the nearest
 * grid intersection. Used during panel drag and resize operations.
 */

import { useCallback } from "react";
import { DEFAULT_GRID_SIZE, type PanelPosition } from "./types";

/** Options for the snap-to-grid hook. */
interface UseSnapGridOptions {
  /** Grid cell size in pixels. Defaults to `DEFAULT_GRID_SIZE` (20px). */
  gridSize?: number;
}

/** Snap a single numeric value to the nearest grid line. */
export function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Hook that returns a memoised `snapToGrid` function.
 *
 * @example
 * ```ts
 * const { snapToGrid } = useSnapGrid({ gridSize: 20 });
 * const snapped = snapToGrid({ x: 113, y: 47 }); // { x: 120, y: 40 }
 * ```
 */
export function useSnapGrid(options: UseSnapGridOptions = {}) {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;

  const snapToGrid = useCallback(
    (position: PanelPosition): PanelPosition => ({
      x: snapValue(position.x, gridSize),
      y: snapValue(position.y, gridSize),
    }),
    [gridSize],
  );

  return { snapToGrid, gridSize };
}

/**
 * Pure utility version (no hook) for use outside React components.
 */
export function snapToGrid(
  position: PanelPosition,
  gridSize: number = DEFAULT_GRID_SIZE,
): PanelPosition {
  return {
    x: snapValue(position.x, gridSize),
    y: snapValue(position.y, gridSize),
  };
}
