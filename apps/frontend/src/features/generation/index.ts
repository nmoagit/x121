/**
 * Recursive Video Generation Loop feature (PRD-24).
 *
 * Barrel export for types, hooks, and components.
 */

// Types
export {
  BOUNDARY_MODE_LABEL,
  BOUNDARY_MODES,
  type BatchGenerateRequest,
  type BatchGenerateResponse,
  type BoundaryMode,
  type GenerationProgress,
  type SegmentStatus,
  type SelectBoundaryFrameRequest,
  type StartGenerationRequest,
  type StartGenerationResponse,
  type StopDecision,
} from "./types";

// Hooks
export {
  generationKeys,
  useBatchGenerate,
  useGenerationProgress,
  useSelectBoundaryFrame,
  useStartGeneration,
} from "./hooks/use-generation";

// Components
export { BoundaryFrameScrubber } from "./BoundaryFrameScrubber";
export { GenerationProgressBar } from "./GenerationProgressBar";
