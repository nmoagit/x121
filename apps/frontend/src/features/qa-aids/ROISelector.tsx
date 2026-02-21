/**
 * ROISelector — Click-and-drag to define a Region of Interest on a video frame.
 *
 * Renders a visual rectangle overlay on top of the video that can be
 * created by dragging, then resized and repositioned. The selected
 * region is tracked across frames for inspection in the ROIZoomPanel.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import {
  computeResize,
  getResizeHandle,
  HANDLE_SIZE,
  isInsideSelection,
  MIN_ROI_SIZE,
} from "./roiHelpers";
import type { DragAction } from "./roiHelpers";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ROISelection {
  /** X offset as a fraction of container width (0-1). */
  x: number;
  /** Y offset as a fraction of container height (0-1). */
  y: number;
  /** Width as a fraction of container width (0-1). */
  width: number;
  /** Height as a fraction of container height (0-1). */
  height: number;
}

export interface ROISelectorProps {
  /** Whether the ROI selector is active. */
  enabled: boolean;
  /** Current ROI selection (controlled). */
  selection: ROISelection | null;
  /** Called when the user creates or modifies the ROI. */
  onSelectionChange: (selection: ROISelection | null) => void;
  /** Additional className for the wrapper. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ROISelector({
  enabled,
  selection,
  onSelectionChange,
  className,
}: ROISelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragAction, setDragAction] = useState<DragAction | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, selection: null as ROISelection | null });

  /** Convert a mouse/touch event to normalized coordinates (0-1). */
  const toNormalized = useCallback(
    (clientX: number, clientY: number): { nx: number; ny: number } => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { nx: 0, ny: 0 };
      return {
        nx: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        ny: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    [],
  );

  /** Handle mouse down -- start creating or manipulating ROI. */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();

      const { nx, ny } = toNormalized(e.clientX, e.clientY);

      if (selection) {
        const handle = getResizeHandle(selection, nx, ny, containerRef.current);
        if (handle) {
          setDragAction(handle);
          dragStartRef.current = { x: nx, y: ny, selection: { ...selection } };
          return;
        }

        if (isInsideSelection(selection, nx, ny)) {
          setDragAction("move");
          dragStartRef.current = { x: nx, y: ny, selection: { ...selection } };
          return;
        }
      }

      setDragAction("create");
      dragStartRef.current = { x: nx, y: ny, selection: null };
      onSelectionChange({ x: nx, y: ny, width: 0, height: 0 });
    },
    [enabled, selection, onSelectionChange, toNormalized],
  );

  /** Handle mouse move during drag. */
  useEffect(() => {
    if (!dragAction) return;

    function handleMouseMove(e: MouseEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const start = dragStartRef.current;

      if (dragAction === "create") {
        onSelectionChange({
          x: Math.min(start.x, nx),
          y: Math.min(start.y, ny),
          width: Math.abs(nx - start.x),
          height: Math.abs(ny - start.y),
        });
      } else if (dragAction === "move" && start.selection) {
        const dx = nx - start.x;
        const dy = ny - start.y;
        onSelectionChange({
          ...start.selection,
          x: Math.max(0, Math.min(1 - start.selection.width, start.selection.x + dx)),
          y: Math.max(0, Math.min(1 - start.selection.height, start.selection.y + dy)),
        });
      } else if (dragAction?.startsWith("resize") && start.selection) {
        onSelectionChange(computeResize(dragAction as DragAction, start.selection, start, nx, ny));
      }
    }

    function handleMouseUp() {
      if (dragAction === "create" && selection) {
        if (selection.width < MIN_ROI_SIZE || selection.height < MIN_ROI_SIZE) {
          onSelectionChange(null);
        }
      }
      setDragAction(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragAction, selection, onSelectionChange]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 w-full h-full cursor-crosshair", className)}
      onMouseDown={handleMouseDown}
      data-testid="roi-selector"
    >
      {selection && selection.width > 0 && selection.height > 0 && (
        <div
          className="absolute border-2 border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/10"
          style={{
            left: `${selection.x * 100}%`,
            top: `${selection.y * 100}%`,
            width: `${selection.width * 100}%`,
            height: `${selection.height * 100}%`,
          }}
          data-testid="roi-selection-rect"
        >
          <ResizeHandle position="nw" />
          <ResizeHandle position="ne" />
          <ResizeHandle position="sw" />
          <ResizeHandle position="se" />
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Resize Handle Sub-component
   -------------------------------------------------------------------------- */

function ResizeHandle({ position }: { position: "nw" | "ne" | "sw" | "se" }) {
  const positionClasses: Record<string, string> = {
    nw: "-top-1 -left-1 cursor-nw-resize",
    ne: "-top-1 -right-1 cursor-ne-resize",
    sw: "-bottom-1 -left-1 cursor-sw-resize",
    se: "-bottom-1 -right-1 cursor-se-resize",
  };

  return (
    <div
      className={cn(
        "absolute bg-[var(--color-action-primary)] rounded-[var(--radius-sm)]",
        positionClasses[position],
      )}
      style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
      data-handle={position}
    />
  );
}
