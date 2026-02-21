/**
 * Panel resize hook (PRD-30).
 *
 * Provides pointer-event-based resize handling for panels.
 * Enforces min/max constraints and snaps to the configured grid.
 */

import { useCallback, useRef } from "react";
import {
  DEFAULT_GRID_SIZE,
  MAX_PANEL_HEIGHT,
  MAX_PANEL_WIDTH,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  type PanelSize,
} from "./types";
import { snapValue } from "./useSnapGrid";

/** Resize direction — which edge or corner is being dragged. */
export type ResizeDirection = "e" | "s" | "se";

/** Options for the panel resize hook. */
interface UsePanelResizeOptions {
  /** Current panel size. */
  size: PanelSize;
  /** Callback fired on every resize movement. */
  onResize: (size: PanelSize) => void;
  /** Callback fired when the resize finishes. */
  onResizeEnd?: (size: PanelSize) => void;
  /** Grid size for snapping. Defaults to `DEFAULT_GRID_SIZE`. */
  gridSize?: number;
  /** Minimum width constraint. Defaults to `MIN_PANEL_WIDTH`. */
  minWidth?: number;
  /** Minimum height constraint. Defaults to `MIN_PANEL_HEIGHT`. */
  minHeight?: number;
  /** Maximum width constraint. Defaults to `MAX_PANEL_WIDTH`. */
  maxWidth?: number;
  /** Maximum height constraint. Defaults to `MAX_PANEL_HEIGHT`. */
  maxHeight?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Hook providing imperative resize handlers.
 *
 * Returns `startResize` which should be called from a `onPointerDown`
 * event on a resize handle element.
 */
export function usePanelResize(options: UsePanelResizeOptions) {
  const {
    size,
    onResize,
    onResizeEnd,
    gridSize = DEFAULT_GRID_SIZE,
    minWidth = MIN_PANEL_WIDTH,
    minHeight = MIN_PANEL_HEIGHT,
    maxWidth = MAX_PANEL_WIDTH,
    maxHeight = MAX_PANEL_HEIGHT,
  } = options;

  const startRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    direction: ResizeDirection;
  } | null>(null);

  const startResize = useCallback(
    (event: React.PointerEvent, direction: ResizeDirection) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);

      startRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: size.width,
        startHeight: size.height,
        direction,
      };

      const handleMove = (e: PointerEvent) => {
        const start = startRef.current;
        if (!start) return;

        let newWidth = start.startWidth;
        let newHeight = start.startHeight;

        if (start.direction === "e" || start.direction === "se") {
          newWidth = start.startWidth + (e.clientX - start.startX);
        }
        if (start.direction === "s" || start.direction === "se") {
          newHeight = start.startHeight + (e.clientY - start.startY);
        }

        newWidth = snapValue(clamp(newWidth, minWidth, maxWidth), gridSize);
        newHeight = snapValue(clamp(newHeight, minHeight, maxHeight), gridSize);

        onResize({ width: newWidth, height: newHeight });
      };

      const handleUp = () => {
        startRef.current = null;
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
        target.removeEventListener("pointercancel", handleUp);
        onResizeEnd?.(size);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
      target.addEventListener("pointercancel", handleUp);
    },
    [size, onResize, onResizeEnd, gridSize, minWidth, minHeight, maxWidth, maxHeight],
  );

  return { startResize };
}
