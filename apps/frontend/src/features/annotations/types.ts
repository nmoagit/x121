/**
 * TypeScript types for the on-frame annotation & markup system (PRD-70).
 *
 * These types mirror the backend API response shapes for frame annotations,
 * drawing objects, and annotation layers.
 */

/* --------------------------------------------------------------------------
   Drawing tools
   -------------------------------------------------------------------------- */

export type DrawingTool =
  | "pen"
  | "circle"
  | "rectangle"
  | "arrow"
  | "highlight"
  | "text";

/** All available drawing tool values. */
export const DRAWING_TOOLS: DrawingTool[] = [
  "pen",
  "circle",
  "rectangle",
  "arrow",
  "highlight",
  "text",
];

/** Map a drawing tool to a human-readable label. */
export function toolLabel(tool: DrawingTool): string {
  switch (tool) {
    case "pen":
      return "Pen";
    case "circle":
      return "Circle";
    case "rectangle":
      return "Rectangle";
    case "arrow":
      return "Arrow";
    case "highlight":
      return "Highlight";
    case "text":
      return "Text";
    default:
      return tool;
  }
}

/* --------------------------------------------------------------------------
   Drawing objects
   -------------------------------------------------------------------------- */

/** A single drawing object placed on a frame. */
export interface DrawingObject {
  tool: DrawingTool;
  data: Record<string, unknown>;
  color: string;
  strokeWidth: number;
}

/* --------------------------------------------------------------------------
   Frame annotations
   -------------------------------------------------------------------------- */

/** A row from the `frame_annotations` table. */
export interface FrameAnnotation {
  id: number;
  segment_id: number;
  user_id: number;
  frame_number: number;
  annotations_json: DrawingObject[];
  review_note_id: number | null;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a new frame annotation. */
export interface CreateFrameAnnotation {
  frame_number: number;
  annotations_json: DrawingObject[];
  review_note_id?: number;
}

/** DTO for updating an existing frame annotation. */
export interface UpdateFrameAnnotation {
  annotations_json?: DrawingObject[];
  review_note_id?: number;
}

/* --------------------------------------------------------------------------
   Annotation summary
   -------------------------------------------------------------------------- */

/** Aggregated annotation summary for a segment. */
export interface AnnotationSummary {
  total_annotations: number;
  annotated_frames: number;
  annotators: number[];
}

/* --------------------------------------------------------------------------
   Annotation layers
   -------------------------------------------------------------------------- */

/** A per-reviewer annotation layer for visibility toggling. */
export interface AnnotationLayer {
  userId: number;
  userName: string;
  visible: boolean;
  annotations: FrameAnnotation[];
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Maximum annotations per frame. */
export const MAX_ANNOTATIONS_PER_FRAME = 50;

/** Maximum stroke width in pixels. */
export const MAX_STROKE_WIDTH = 20;

/** Minimum stroke width in pixels. */
export const MIN_STROKE_WIDTH = 0.5;

/** Maximum text annotation length. */
export const MAX_TEXT_LENGTH = 500;

/** Default color presets for the color picker. */
export const COLOR_PRESETS = [
  "#FF0000",
  "#FF6600",
  "#FFCC00",
  "#33CC33",
  "#0099FF",
  "#6633FF",
  "#FF3399",
  "#FFFFFF",
  "#000000",
] as const;
