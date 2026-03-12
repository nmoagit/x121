/**
 * Canvas overlay for drawing annotations on video frames (PRD-70).
 *
 * Provides tool selection, color picking, stroke width control, and
 * undo/redo for in-session annotation edits.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { ChevronDown, ChevronUp } from "@/tokens/icons";

import { TextLabel } from "./TextLabel";
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
  /** Existing annotation objects to render (read-only, from previous sessions). */
  existingAnnotations?: DrawingObject[];
  /** Called when a new annotation is completed. */
  onAnnotationComplete?: (annotation: DrawingObject) => void;
  /**
   * Called whenever the full annotation list changes (including undo/redo).
   * Returns only user-drawn annotations (excludes existingAnnotations).
   */
  onAnnotationsChange?: (annotations: DrawingObject[]) => void;
  /** Whether the canvas is in edit mode. */
  editable?: boolean;
  /** When true, renders as a transparent overlay (no border, toolbar floats at top). */
  overlay?: boolean;
}

interface Point {
  x: number;
  y: number;
}

/* --------------------------------------------------------------------------
   Rendering helpers
   -------------------------------------------------------------------------- */

function renderObject(ctx: CanvasRenderingContext2D, obj: DrawingObject) {
  ctx.strokeStyle = obj.color;
  ctx.fillStyle = obj.color;
  ctx.lineWidth = obj.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const d = obj.data as Record<string, unknown>;

  if (obj.tool === "pen" || obj.tool === "highlight") {
    const pts = d.points as Point[] | undefined;
    if (!pts || pts.length < 2) return;
    if (obj.tool === "highlight") ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (obj.tool === "rectangle") {
    const sx = d.startX as number;
    const sy = d.startY as number;
    const ex = d.endX as number;
    const ey = d.endY as number;
    ctx.beginPath();
    ctx.rect(sx, sy, ex - sx, ey - sy);
    ctx.stroke();
  } else if (obj.tool === "circle") {
    const sx = d.startX as number;
    const sy = d.startY as number;
    const ex = d.endX as number;
    const ey = d.endY as number;
    const rx = Math.abs(ex - sx) / 2;
    const ry = Math.abs(ey - sy) / 2;
    const cx = (sx + ex) / 2;
    const cy = (sy + ey) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obj.tool === "arrow") {
    const sx = d.startX as number;
    const sy = d.startY as number;
    const ex = d.endX as number;
    const ey = d.endY as number;
    const angle = Math.atan2(ey - sy, ex - sx);
    const headLen = Math.max(10, obj.strokeWidth * 4);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - headLen * Math.cos(angle - Math.PI / 6),
      ey - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - headLen * Math.cos(angle + Math.PI / 6),
      ey - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  } else if (obj.tool === "text") {
    const tx = d.x as number;
    const ty = d.y as number;
    const content = d.content as string;
    const fontSize = (d.fontSize as number) ?? 16;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText(content ?? "", tx, ty);
  }
}

function renderInProgress(
  ctx: CanvasRenderingContext2D,
  tool: DrawingTool,
  start: Point,
  points: Point[],
  color: string,
  sw: number,
) {
  ctx.strokeStyle = tool === "highlight" ? `${color}80` : color;
  ctx.lineWidth = tool === "highlight" ? sw * 3 : sw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (tool === "pen" || tool === "highlight") {
    if (tool === "highlight") ctx.globalAlpha = 0.4;
    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (tool === "rectangle") {
    const end = points.at(-1) ?? start;
    ctx.beginPath();
    ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.stroke();
  } else if (tool === "circle") {
    const end = points.at(-1) ?? start;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === "arrow") {
    const end = points.at(-1) ?? start;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = Math.max(10, sw * 4);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }
}

/* --------------------------------------------------------------------------
   Hit-testing
   -------------------------------------------------------------------------- */

/** Returns the index in allAnnotations if the point is near a text annotation, or -1. */
function hitTestText(
  allAnnotations: DrawingObject[],
  point: Point,
  ctx: CanvasRenderingContext2D | null,
): number {
  // Walk in reverse so topmost (last drawn) is hit first.
  for (let i = allAnnotations.length - 1; i >= 0; i--) {
    const obj = allAnnotations[i]!;
    if (obj.tool !== "text") continue;
    const d = obj.data as Record<string, unknown>;
    const tx = d.x as number;
    const ty = d.y as number;
    const content = (d.content as string) ?? "";
    const fontSize = (d.fontSize as number) ?? 16;

    // Measure the text bounding box using the canvas context.
    let textWidth = content.length * fontSize * 0.6; // fallback estimate
    if (ctx) {
      ctx.font = `${fontSize}px sans-serif`;
      textWidth = ctx.measureText(content).width;
    }

    // Text is drawn at (tx, ty) where ty is the baseline.
    // Bounding box: x=[tx, tx+textWidth], y=[ty-fontSize, ty+fontSize*0.2]
    if (
      point.x >= tx - 4 &&
      point.x <= tx + textWidth + 4 &&
      point.y >= ty - fontSize - 4 &&
      point.y <= ty + fontSize * 0.2 + 4
    ) {
      return i;
    }
  }
  return -1;
}

interface DragState {
  /** Index in allAnnotations of the item being dragged. */
  annotationIndex: number;
  /** Whether the annotation lives in existingAnnotations (true) or undoStack (false). */
  isExisting: boolean;
  /** Offset from the annotation's (x,y) to the initial mouse position. */
  offsetX: number;
  offsetY: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DrawingCanvas({
  width,
  height,
  existingAnnotations = [],
  onAnnotationComplete,
  onAnnotationsChange,
  editable = true,
  overlay = false,
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
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [textPlacement, setTextPlacement] = useState<Point | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<Point | null>(null);

  const allAnnotations = [...existingAnnotations, ...undoStack];
  const totalCount = allAnnotations.length;

  // Notify parent whenever user-drawn annotations change
  const prevUndoRef = useRef(undoStack);
  useEffect(() => {
    if (undoStack !== prevUndoRef.current) {
      prevUndoRef.current = undoStack;
      onAnnotationsChange?.(undoStack);
    }
  }, [undoStack, onAnnotationsChange]);

  // --- Canvas repaint on every render --------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < allAnnotations.length; i++) {
      const obj = allAnnotations[i]!;
      // If this annotation is being dragged, render at the drag position instead.
      if (dragging && dragPos && i === dragging.annotationIndex && obj.tool === "text") {
        const d = obj.data as Record<string, unknown>;
        const fontSize = (d.fontSize as number) ?? 16;
        ctx.fillStyle = obj.color;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText((d.content as string) ?? "", dragPos.x, dragPos.y);
      } else {
        renderObject(ctx, obj);
      }
    }

    if (isDrawing && startPoint) {
      renderInProgress(ctx, activeTool, startPoint, pathPoints, color, strokeWidth);
    }
  });

  // --- Mouse handlers ------------------------------------------------------

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
      if (activeTool === "text") {
        // Check if clicking on an existing text annotation to drag it.
        const ctx = canvasRef.current?.getContext("2d") ?? null;
        const all = [...existingAnnotations, ...undoStack];
        const hitIdx = hitTestText(all, point, ctx);
        if (hitIdx >= 0) {
          const obj = all[hitIdx]!;
          const d = obj.data as Record<string, unknown>;
          const isExisting = hitIdx < existingAnnotations.length;
          setDragging({
            annotationIndex: hitIdx,
            isExisting,
            offsetX: point.x - (d.x as number),
            offsetY: point.y - (d.y as number),
          });
          setDragPos({ x: d.x as number, y: d.y as number });
          return;
        }
        setTextPlacement(point);
        return;
      }
      setIsDrawing(true);
      setStartPoint(point);
      setPathPoints([point]);
    },
    [editable, activeTool, getCanvasPoint, existingAnnotations, undoStack],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!editable) return;
      const point = getCanvasPoint(e);
      // Handle text dragging
      if (dragging) {
        setDragPos({
          x: point.x - dragging.offsetX,
          y: point.y - dragging.offsetY,
        });
        return;
      }
      if (!isDrawing) return;
      setPathPoints((prev) => {
        if (activeTool === "pen" || activeTool === "highlight") {
          return [...prev, point];
        }
        return [prev[0] ?? point, point];
      });
    },
    [isDrawing, editable, activeTool, getCanvasPoint, dragging],
  );

  const handleMouseUp = useCallback(() => {
    // Finalize text drag
    if (dragging && dragPos) {
      const all = [...existingAnnotations, ...undoStack];
      const obj = all[dragging.annotationIndex]!;
      const movedAnnotation: DrawingObject = {
        ...obj,
        data: { ...(obj.data as Record<string, unknown>), x: dragPos.x, y: dragPos.y },
      };

      if (dragging.isExisting) {
        // Clone the existing annotation into undoStack with the new position.
        // The original stays rendered at the old position via existingAnnotations,
        // but we visually override it by pushing a replacement to the undoStack.
        // To avoid duplication, we also need to track that the existing one is "moved".
        // Simplest: push the moved copy to undoStack — the original in existing
        // will still render, but the new one draws on top.
        // A cleaner approach: replace in undoStack with a move marker.
        // For now, just push the moved annotation.
        setUndoStack((prev) => [...prev, movedAnnotation]);
        setRedoStack([]);
      } else {
        // Update the annotation in-place in the undoStack.
        const undoIdx = dragging.annotationIndex - existingAnnotations.length;
        setUndoStack((prev) => {
          const next = [...prev];
          next[undoIdx] = movedAnnotation;
          return next;
        });
      }
      setDragging(null);
      setDragPos(null);
      return;
    }

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
    dragging,
    dragPos,
    existingAnnotations,
    undoStack,
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

  const handleTextConfirm = useCallback(
    (annotation: DrawingObject) => {
      setUndoStack((prev) => [...prev, annotation]);
      setRedoStack([]);
      onAnnotationComplete?.(annotation);
      setTextPlacement(null);
    },
    [onAnnotationComplete],
  );

  const handleTextCancel = useCallback(() => {
    setTextPlacement(null);
  }, []);

  return (
    <div
      className={overlay ? "relative flex flex-col" : "flex flex-col gap-2"}
      style={overlay ? { width, height } : undefined}
      data-testid="drawing-canvas"
    >
      {/* Toolbar — compact in overlay mode, full in standalone */}
      {editable && overlay && (
        <div
          className="absolute top-0 left-0 right-0 z-20 flex flex-col bg-black/70 backdrop-blur-sm rounded-t"
          data-testid="tool-selector"
        >
          {/* Compact bar — always visible */}
          <div className="flex items-center gap-1 px-2 py-1">
            {/* Tool buttons — icon-style, abbreviated */}
            {DRAWING_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                  activeTool === tool
                    ? "bg-[var(--color-action-primary)] text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                onClick={() => setActiveTool(tool)}
                title={toolLabel(tool)}
                data-testid={`tool-${tool}`}
              >
                {toolLabel(tool).charAt(0)}
              </button>
            ))}

            <div className="mx-0.5 h-4 w-px bg-white/20" />

            {/* Active color swatch */}
            <button
              type="button"
              className="h-5 w-5 rounded-full border-2 border-white/50"
              style={{ backgroundColor: color }}
              onClick={() => setToolbarExpanded((v) => !v)}
              title="Color / options"
            />

            <div className="mx-0.5 h-4 w-px bg-white/20" />

            {/* Undo / Redo */}
            <button
              type="button"
              className="px-1 py-0.5 text-xs text-white/70 hover:text-white disabled:text-white/30 transition-colors"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              data-testid="undo-button"
            >
              Undo
            </button>
            <button
              type="button"
              className="px-1 py-0.5 text-xs text-white/70 hover:text-white disabled:text-white/30 transition-colors"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              data-testid="redo-button"
            >
              Redo
            </button>

            {/* Expand toggle */}
            <button
              type="button"
              className="ml-auto p-0.5 text-white/70 hover:text-white transition-colors"
              onClick={() => setToolbarExpanded((v) => !v)}
              title={toolbarExpanded ? "Collapse" : "More options"}
            >
              {toolbarExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Expanded options — colors, stroke width */}
          {toolbarExpanded && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2 py-1">
              <div className="flex items-center gap-1" data-testid="color-picker">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`h-4 w-4 rounded-full border-2 ${
                      color === preset
                        ? "border-white"
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
                  className="ml-1 w-16 rounded border border-white/20 bg-white/10 px-1 py-0.5 text-xs text-white"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#RRGGBB"
                  data-testid="color-input"
                />
              </div>

              <div className="mx-0.5 h-4 w-px bg-white/20" />

              <div className="flex items-center gap-1" data-testid="stroke-width">
                <span className="text-xs text-white/60">Width</span>
                <input
                  id="stroke-width-slider"
                  type="range"
                  min={MIN_STROKE_WIDTH}
                  max={MAX_STROKE_WIDTH}
                  step={0.5}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-16"
                  data-testid="stroke-width-slider"
                />
                <span className="w-4 text-center text-xs text-white/60">
                  {strokeWidth}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toolbar — full layout for standalone (non-overlay) mode */}
      {editable && !overlay && (
        <div className="flex flex-wrap items-center gap-2" data-testid="tool-selector">
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

          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

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

          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

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

          <div className="mx-1 h-6 w-px bg-[var(--color-border-default)]" />

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
      <div className={overlay ? "relative flex-1" : "relative"} style={overlay ? undefined : { width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={
            overlay
              ? dragging ? "cursor-grabbing" : "cursor-crosshair"
              : dragging ? "cursor-grabbing rounded border border-[var(--color-border-default)]" : "cursor-crosshair rounded border border-[var(--color-border-default)]"
          }
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-testid="annotation-canvas"
        />
        {/* Annotation count overlay */}
        <div className={`absolute ${overlay ? "bottom-2 right-2" : "bottom-1 right-1"} rounded bg-black/50 px-1.5 py-0.5 text-xs text-white`}>
          {totalCount} annotation{totalCount !== 1 ? "s" : ""}
        </div>

        {/* Text label placement popup */}
        {textPlacement && (
          <TextLabel
            x={textPlacement.x}
            y={textPlacement.y}
            initialColor={color}
            onConfirm={handleTextConfirm}
            onCancel={handleTextCancel}
          />
        )}
      </div>
    </div>
  );
}
