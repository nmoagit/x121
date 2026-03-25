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
  /** Initial tool to select on mount. */
  initialTool?: DrawingTool;
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

/** Scale a 0-1 normalized coordinate to canvas pixel space. */
function sx(v: number, canvasW: number): number { return v <= 1.5 ? v * canvasW : v; }
function sy(v: number, canvasH: number): number { return v <= 1.5 ? v * canvasH : v; }

function renderObject(ctx: CanvasRenderingContext2D, obj: DrawingObject, cw?: number, ch?: number) {
  const w = cw ?? ctx.canvas.width;
  const h = ch ?? ctx.canvas.height;
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
    ctx.moveTo(sx(pts[0]!.x, w), sy(pts[0]!.y, h));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(sx(pts[i]!.x, w), sy(pts[i]!.y, h));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (obj.tool === "rectangle") {
    const x1 = sx(d.startX as number, w);
    const y1 = sy(d.startY as number, h);
    const x2 = sx(d.endX as number, w);
    const y2 = sy(d.endY as number, h);
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.stroke();
  } else if (obj.tool === "circle") {
    const x1 = sx(d.startX as number, w);
    const y1 = sy(d.startY as number, h);
    const x2 = sx(d.endX as number, w);
    const y2 = sy(d.endY as number, h);
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (obj.tool === "arrow") {
    const x1 = sx(d.startX as number, w);
    const y1 = sy(d.startY as number, h);
    const x2 = sx(d.endX as number, w);
    const y2 = sy(d.endY as number, h);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, obj.strokeWidth * 4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  } else if (obj.tool === "text") {
    const tx = sx(d.x as number, w);
    const ty = sy(d.y as number, h);
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
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.strokeStyle = tool === "highlight" ? `${color}80` : color;
  ctx.lineWidth = tool === "highlight" ? sw * 3 : sw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (tool === "pen" || tool === "highlight") {
    if (tool === "highlight") ctx.globalAlpha = 0.4;
    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(sx(points[0]!.x, w), sy(points[0]!.y, h));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(sx(points[i]!.x, w), sy(points[i]!.y, h));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (tool === "rectangle") {
    const end = points.at(-1) ?? start;
    const x1 = sx(start.x, w), y1 = sy(start.y, h);
    const x2 = sx(end.x, w), y2 = sy(end.y, h);
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.stroke();
  } else if (tool === "circle") {
    const end = points.at(-1) ?? start;
    const x1 = sx(start.x, w), y1 = sy(start.y, h);
    const x2 = sx(end.x, w), y2 = sy(end.y, h);
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === "arrow") {
    const end = points.at(-1) ?? start;
    const x1 = sx(start.x, w), y1 = sy(start.y, h);
    const x2 = sx(end.x, w), y2 = sy(end.y, h);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, sw * 4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6),
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
  initialTool,
  overlay = false,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>(initialTool ?? "pen");
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
  /** Indices of existing annotations that have been moved (replaced by undoStack entries). */
  const [movedExistingIndices, setMovedExistingIndices] = useState<Set<number>>(new Set());

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
      // Skip existing annotations that have been moved (their replacement is in undoStack)
      if (i < existingAnnotations.length && movedExistingIndices.has(i)) continue;
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

  // Return coordinates normalized to 0-1 range so annotations scale with canvas size.
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
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
        // Push moved copy to undoStack and mark original as replaced
        setUndoStack((prev) => [...prev, movedAnnotation]);
        setRedoStack([]);
        setMovedExistingIndices((prev) => new Set([...prev, dragging.annotationIndex]));
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
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
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
              className="px-1 py-0.5 text-[10px] font-mono text-white/70 hover:text-white disabled:text-white/30 transition-colors"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              data-testid="undo-button"
            >
              Undo
            </button>
            <button
              type="button"
              className="px-1 py-0.5 text-[10px] font-mono text-white/70 hover:text-white disabled:text-white/30 transition-colors"
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
                  className="ml-1 w-16 rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[10px] font-mono text-white"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#RRGGBB"
                  data-testid="color-input"
                />
              </div>

              <div className="mx-0.5 h-4 w-px bg-white/20" />

              <div className="flex items-center gap-1" data-testid="stroke-width">
                <span className="text-[10px] font-mono text-white/60">Width</span>
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
                <span className="w-4 text-center text-[10px] font-mono text-white/60">
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
        <div className={`absolute ${overlay ? "bottom-2 right-2" : "bottom-1 right-1"} rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-mono text-white`}>
          {totalCount} annotation{totalCount !== 1 ? "s" : ""}
        </div>

        {/* Text label placement popup */}
        {textPlacement && (
          <TextLabel
            x={textPlacement.x}
            y={textPlacement.y}
            canvasWidth={width}
            canvasHeight={height}
            initialColor={color}
            onConfirm={handleTextConfirm}
            onCancel={handleTextCancel}
          />
        )}
      </div>
    </div>
  );
}
