/**
 * Types for Recursive Video Generation Loop (PRD-24).
 */

/* --------------------------------------------------------------------------
   Stop decision (mirrors core::generation::StopDecision)
   -------------------------------------------------------------------------- */

export type StopDecision = "continue" | "elastic_stop" | "stop";

/* --------------------------------------------------------------------------
   Boundary selection modes
   -------------------------------------------------------------------------- */

export type BoundaryMode = "auto" | "manual" | "last";

export const BOUNDARY_MODES: BoundaryMode[] = ["auto", "manual", "last"];

export const BOUNDARY_MODE_LABEL: Record<BoundaryMode, string> = {
  auto: "Automatic",
  manual: "Manual",
  last: "Last Frame",
};

/* --------------------------------------------------------------------------
   Segment status (generation-specific)
   -------------------------------------------------------------------------- */

export type SegmentStatus = "pending" | "generating" | "completed" | "failed";

/* --------------------------------------------------------------------------
   Entities / responses
   -------------------------------------------------------------------------- */

/** Real-time generation progress snapshot from the API. */
export interface GenerationProgress {
  scene_id: number;
  segments_completed: number;
  segments_estimated: number | null;
  cumulative_duration: number;
  target_duration: number | null;
  elapsed_secs: number;
  estimated_remaining_secs: number | null;
}

/* --------------------------------------------------------------------------
   Request DTOs
   -------------------------------------------------------------------------- */

export interface StartGenerationRequest {
  boundary_mode?: BoundaryMode;
}

export interface BatchGenerateRequest {
  scene_ids: number[];
}

export interface SelectBoundaryFrameRequest {
  frame_index: number;
}

/* --------------------------------------------------------------------------
   Start generation response
   -------------------------------------------------------------------------- */

export interface StartGenerationResponse {
  scene_id: number;
  status: string;
  total_segments_estimated: number;
  boundary_mode: BoundaryMode;
}

/* --------------------------------------------------------------------------
   Batch generation response
   -------------------------------------------------------------------------- */

export interface BatchGenerateResponse {
  started: number[];
  errors: Array<{ scene_id: number; error: string }>;
}
