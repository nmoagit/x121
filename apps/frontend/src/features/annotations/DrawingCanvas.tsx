/**
 * Canvas overlay for drawing annotations on video frames (PRD-70).
 *
 * Provides tool selection, color picking, stroke width control, and
 * undo/redo for in-session annotation edits.
 */

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/primitives/Button";

import type { DrawingObject, DrawingTool } from "./types";
import {
  COLOR_PRESETS,
  DRAWING_TOOLS,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  toolLabel,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface DrawingCanvasProps {
  /** Width of the canvas in pixels. */
  width: number;
  /** Height of the canvas in pixels. */
  height: number;
  /** Existing annotation objects to render. */
  existingAnnotations?: DrawingObject[];
  /** Called when a new annotation is completed. */
  onAnnotationComplete?: (annotation: DrawingObject) => void;
  /** Whether the canvas is in edit mode. */
  editable?: boolean;
}

interface Point {
  x: number;
  y: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DrawingCanvas({
  width,
  height,
  existingAnnotations = [],
  onAnnotationComplete,
  editable = true,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState("#FF0000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [pathPoints, setPathPoints] = useState<Point[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingObject[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingObject[]>([]);

  const allAnnotations = [...existingAnnotations, ...undoStack];

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!editable) return;
      const point = getCanvasPoint(e);
      setIsDrawing(true);
      setStartPoint(point);
      if (activeTool === "pen" || activeTool === "highlight") {
        setPathPoints([point]);
      }
    },
    [editable, activeTool, getCanvasPoint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !editable) return;
      const point = getCanvasPoint(e);
      if (activeTool === "pen" || activeTool === "highlight") {
        setPathPoints((prev) => [...prev, point]);
      }
    },
    [isDrawing, editable, activeTool, getCanvasPoint],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !editable || !startPoint) return;
    setIsDrawing(false);

    let annotation: DrawingObject | null = null;

    if (activeTool === "pen" || activeTool === "highlight") {
      annotation = {
        tool: activeTool,
        data: { points: pathPoints },
        color: activeTool === "highlight" ? `${color}80` : color,
        strokeWidth:
          activeTool === "highlight" ? strokeWidth * 3 : strokeWidth,
      };
    } else if (
      activeTool === "circle" ||
      activeTool === "rectangle" ||
      activeTool === "arrow"
    ) {
      annotation = {
        tool: activeTool,
        data: {
          startX: startPoint.x,
          startY: startPoint.y,
          endX: pathPoints[pathPoints.length - 1]?.x ?? startPoint.x,
          endY: pathPoints[pathPoints.length - 1]?.y ?? startPoint.y,
        },
        color,
        strokeWidth,
      };
    }

    if (annotation) {
      setUndoStack((prev) => [...prev, annotation]);
      setRedoStack([]);
      onAnnotationComplete?.(annotation);
    }

    setStartPoint(null);
    setPathPoints([]);
  }, [
    isDrawing,
    editable,
    startPoint,
    activeTool,
    pathPoints,
    color,
    strokeWidth,
    onAnnotationComplete,
  ]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev.at(-1);
      if (!last) return prev;
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev.at(-1);
      if (!last) return prev;
      setUndoStack((u) => [...u, last]);
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2" data-testid="drawing-canvas">
      {/* Toolbar */}
      {editable && (
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="tool-selector"
        >
          {/* Tool buttons */}
          {DRAWING_TOOLS.map((tool) => (
            <Button
              key={tool}
              size="sm"
              variant={activeTool === tool ? "primary" : "ghost"}
              onClick={() => setActiveTool(tool)}
              data-testid={`tool-${tool}`}
            >
              {toolLabel(tool)}
            </Button>
          ))}

          {/* Separator */}
          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

          {/* Color picker */}
          <div className="flex items-center gap-1" data-testid="color-picker">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`h-5 w-5 rounded-full border-2 ${
                  color === preset
                    ? "border-[var(--color-action-primary)]"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: preset }}
                onClick={() => setColor(preset)}
                aria-label={`Color ${preset}`}
                data-testid={`color-swatch-${preset}`}
              />
            ))}
            <input
              type="text"
              className="ml-1 w-20 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-1 py-0.5 text-xs"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#RRGGBB"
              data-testid="color-input"
            />
          </div>

          {/* Separator */}
          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

          {/* Stroke width slider */}
          <div className="flex items-center gap-1" data-testid="stroke-width">
            <label
              htmlFor="stroke-width-slider"
              className="text-xs text-[var(--color-text-muted)]"
            >
              Width
            </label>
            <input
              id="stroke-width-slider"
              type="range"
              min={MIN_STROKE_WIDTH}
              max={MAX_STROKE_WIDTH}
              step={0.5}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-20"
              data-testid="stroke-width-slider"
            />
            <span className="w-6 text-center text-xs text-[var(--color-text-muted)]">
              {strokeWidth}
            </span>
          </div>

          {/* Separator */}
          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

          {/* Undo/Redo */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            data-testid="undo-button"
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            data-testid="redo-button"
          >
            Redo
          </Button>
        </div>
      )}

      {/* Canvas */}
      <div className="relative" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="cursor-crosshair rounded border border-[var(--color-border-default)]"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-testid="annotation-canvas"
        />
        {/* Annotation count overlay */}
        <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {allAnnotations.length} annotation
          {allAnnotations.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
