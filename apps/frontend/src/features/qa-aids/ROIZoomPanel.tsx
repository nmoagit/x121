/**
 * ROIZoomPanel — Floating draggable panel showing the zoomed view
 * of a selected Region of Interest at configurable magnification.
 *
 * Continuously re-renders the selected region from the video element
 * at 2x/4x/8x magnification for micro-artifact inspection.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import type { ROISelection } from "./ROISelector";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type Magnification = 2 | 4 | 8;

export interface ROIZoomPanelProps {
  /** The current ROI selection (normalized coordinates). */
  selection: ROISelection;
  /** The video element to sample from. */
  videoElement: HTMLVideoElement | null;
  /** Current magnification level. */
  magnification: Magnification;
  /** Current frame number — triggers re-render. */
  currentFrame: number;
  /** Called when the user closes the panel. */
  onClose: () => void;
  /** Additional className. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PANEL_BASE_WIDTH = 320;
const PANEL_BASE_HEIGHT = 240;
const HEADER_HEIGHT = 32;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ROIZoomPanel({
  selection,
  videoElement,
  magnification,
  currentFrame,
  onClose,
  className,
}: ROIZoomPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );

  // Render the zoomed ROI onto the canvas.
  const renderZoom = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoElement;
    if (!canvas || !video || video.videoWidth === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Source region in pixel coordinates.
    const sx = selection.x * video.videoWidth;
    const sy = selection.y * video.videoHeight;
    const sw = selection.width * video.videoWidth;
    const sh = selection.height * video.videoHeight;

    if (sw <= 0 || sh <= 0) return;

    // Canvas size adapts to the aspect ratio of the ROI.
    const aspectRatio = sw / sh;
    const canvasWidth = PANEL_BASE_WIDTH;
    const canvasHeight = Math.round(canvasWidth / aspectRatio);

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    // Disable image smoothing for crisp pixel zoom at high magnification.
    ctx.imageSmoothingEnabled = magnification <= 2;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
  }, [selection, videoElement, magnification]);

  // Re-render whenever frame or selection changes.
  useEffect(() => {
    renderZoom();
  }, [renderZoom, currentFrame, selection, magnification]);

  // Panel dragging.
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    },
    [position],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.posX + dx,
        y: dragRef.current.posY + dy,
      });
    }

    function handleMouseUp() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 rounded-[var(--radius-lg)] overflow-hidden",
        "bg-[var(--color-surface-primary)] border border-[var(--color-border-default)]",
        "shadow-[var(--shadow-lg)]",
        className,
      )}
      style={{
        left: position.x,
        top: position.y,
        width: PANEL_BASE_WIDTH,
      }}
      data-testid="roi-zoom-panel"
    >
      {/* Draggable header */}
      <div
        className={cn(
          "flex items-center justify-between px-3 select-none cursor-grab active:cursor-grabbing",
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] text-sm",
        )}
        style={{ height: HEADER_HEIGHT }}
        onMouseDown={handleHeaderMouseDown}
      >
        <span>
          ROI Zoom {magnification}x
        </span>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded-[var(--radius-sm)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "hover:bg-[var(--color-surface-tertiary)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
          aria-label="Close ROI zoom panel"
        >
          x
        </button>
      </div>

      {/* Zoomed canvas */}
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ maxHeight: PANEL_BASE_HEIGHT }}
      />
    </div>
  );
}
