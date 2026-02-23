/**
 * On-frame annotation & markup feature (PRD-70).
 *
 * Barrel export for all annotation types, hooks, components, and utilities.
 */

// Types
export type {
  AnnotationLayer,
  AnnotationSummary as AnnotationSummaryData,
  CreateFrameAnnotation,
  DrawingObject,
  DrawingTool,
  FrameAnnotation,
  UpdateFrameAnnotation,
} from "./types";
export {
  COLOR_PRESETS,
  DRAWING_TOOLS,
  MAX_ANNOTATIONS_PER_FRAME,
  MAX_STROKE_WIDTH,
  MAX_TEXT_LENGTH,
  MIN_STROKE_WIDTH,
  toolLabel,
} from "./types";

// Hooks
export {
  annotationKeys,
  useAnnotations,
  useAnnotationsByFrame,
  useAnnotationSummary,
  useCreateAnnotation,
  useDeleteAnnotation,
  useExportFrame,
  useUpdateAnnotation,
} from "./hooks/use-annotations";

// Components
export { AnnotationLayers } from "./AnnotationLayers";
export { AnnotationSummary } from "./AnnotationSummary";
export { DrawingCanvas } from "./DrawingCanvas";
export { TextLabel } from "./TextLabel";

// Utilities
export { exportAnnotatedFrame } from "./exportAnnotation";
