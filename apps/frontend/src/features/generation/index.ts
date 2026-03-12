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
  type GenerationLogEntry,
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
  useCancelGeneration,
  useClearGenerationLog,
  useGenerationLog,
  useGenerationProgress,
  useSelectBoundaryFrame,
  useStartGeneration,
} from "./hooks/use-generation";

// Infrastructure hooks
export {
  infraKeys,
  useInfrastructureStatus,
  useRefreshInstances,
  useStartPod,
  useStopPod,
  type ComfyUIInstanceInfo,
  type InfrastructureStatus,
  type PodStartResult,
  type PodStopResult,
  type RefreshResult,
} from "./hooks/use-infrastructure";

// Components
export { BoundaryFrameScrubber } from "./BoundaryFrameScrubber";
export { GenerationProgressBar } from "./GenerationProgressBar";
export { GenerationTerminal } from "./GenerationTerminal";
export { InfrastructurePanel } from "./InfrastructurePanel";
