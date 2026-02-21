/**
 * TypeScript types for pipeline error recovery & checkpointing (PRD-28).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Checkpoint
   -------------------------------------------------------------------------- */

export interface Checkpoint {
  id: number;
  job_id: number;
  stage_index: number;
  stage_name: string;
  data_path: string;
  metadata: Record<string, unknown> | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Failure diagnostics
   -------------------------------------------------------------------------- */

export interface FailureDiagnostics {
  job_id: number;
  failure_stage_index: number | null;
  failure_stage_name: string | null;
  failure_diagnostics: FailureDiagnosticDetail | null;
  last_checkpoint_id: number | null;
  original_job_id: number | null;
}

export interface FailureDiagnosticDetail {
  stage_index: number;
  stage_name: string;
  error_message: string;
  comfyui_error: string | null;
  node_id: string | null;
  gpu_memory_used_mb: number | null;
  gpu_memory_total_mb: number | null;
  input_state: Record<string, unknown> | null;
  timestamp: string;
}

/* --------------------------------------------------------------------------
   Resume from checkpoint
   -------------------------------------------------------------------------- */

export interface ResumeFromCheckpointInput {
  modified_params?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Pipeline stage status (for UI visualization)
   -------------------------------------------------------------------------- */

export type StageStatus = "completed" | "failed" | "pending";

export interface PipelineStage {
  index: number;
  name: string;
  status: StageStatus;
  checkpoint: Checkpoint | null;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

// Re-export formatBytes from the shared format library so existing imports
// from "./types" continue to work without a breaking change.
// (DRY-151: eliminated local duplicate.)
export { formatBytes } from "@/lib/format";

/** Derive pipeline stages from checkpoints and failure info. */
export function derivePipelineStages(
  checkpoints: Checkpoint[],
  totalStages: number,
  failureStageIndex: number | null,
): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const checkpointMap = new Map(checkpoints.map((cp) => [cp.stage_index, cp]));

  for (let i = 0; i < totalStages; i++) {
    const cp = checkpointMap.get(i) ?? null;
    let status: StageStatus;

    if (i === failureStageIndex) {
      status = "failed";
    } else if (cp) {
      status = "completed";
    } else {
      status = "pending";
    }

    stages.push({
      index: i,
      name: cp?.stage_name ?? `Stage ${i + 1}`,
      status,
      checkpoint: cp,
    });
  }

  return stages;
}
