/**
 * roiHelpers — Pure utility functions for ROI selection geometry.
 *
 * Extracted from ROISelector.tsx to keep the component file focused.
 */

import type { ROISelection } from "./ROISelector";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

export const MIN_ROI_SIZE = 0.02; // Minimum 2% of container dimension
export const HANDLE_SIZE = 8; // Resize handle size in pixels

export type DragAction =
  | "create"
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se";

/* --------------------------------------------------------------------------
   Functions
   -------------------------------------------------------------------------- */

export function isInsideSelection(sel: ROISelection, nx: number, ny: number): boolean {
  return nx >= sel.x && nx <= sel.x + sel.width && ny >= sel.y && ny <= sel.y + sel.height;
}

export function getResizeHandle(
  sel: ROISelection,
  nx: number,
  ny: number,
  container: HTMLDivElement | null,
): DragAction | null {
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const handleNorm = (HANDLE_SIZE / Math.min(rect.width, rect.height)) * 2;

  const corners: { action: DragAction; cx: number; cy: number }[] = [
    { action: "resize-nw", cx: sel.x, cy: sel.y },
    { action: "resize-ne", cx: sel.x + sel.width, cy: sel.y },
    { action: "resize-sw", cx: sel.x, cy: sel.y + sel.height },
    { action: "resize-se", cx: sel.x + sel.width, cy: sel.y + sel.height },
  ];

  for (const corner of corners) {
    if (Math.abs(nx - corner.cx) < handleNorm && Math.abs(ny - corner.cy) < handleNorm) {
      return corner.action;
    }
  }

  return null;
}

export function computeResize(
  action: DragAction,
  originalSel: ROISelection,
  start: { x: number; y: number },
  nx: number,
  ny: number,
): ROISelection {
  const dx = nx - start.x;
  const dy = ny - start.y;
  const sel = { ...originalSel };

  switch (action) {
    case "resize-se":
      sel.width = Math.max(MIN_ROI_SIZE, originalSel.width + dx);
      sel.height = Math.max(MIN_ROI_SIZE, originalSel.height + dy);
      break;
    case "resize-nw":
      sel.x = Math.max(0, originalSel.x + dx);
      sel.y = Math.max(0, originalSel.y + dy);
      sel.width = Math.max(MIN_ROI_SIZE, originalSel.width - dx);
      sel.height = Math.max(MIN_ROI_SIZE, originalSel.height - dy);
      break;
    case "resize-ne":
      sel.y = Math.max(0, originalSel.y + dy);
      sel.width = Math.max(MIN_ROI_SIZE, originalSel.width + dx);
      sel.height = Math.max(MIN_ROI_SIZE, originalSel.height - dy);
      break;
    case "resize-sw":
      sel.x = Math.max(0, originalSel.x + dx);
      sel.width = Math.max(MIN_ROI_SIZE, originalSel.width - dx);
      sel.height = Math.max(MIN_ROI_SIZE, originalSel.height + dy);
      break;
  }

  // Clamp to container bounds.
  sel.width = Math.min(sel.width, 1 - sel.x);
  sel.height = Math.min(sel.height, 1 - sel.y);

  return sel;
}
