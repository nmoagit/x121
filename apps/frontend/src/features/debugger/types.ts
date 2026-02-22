/**
 * TypeScript types for the interactive job debugger (PRD-34).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Debug state
   -------------------------------------------------------------------------- */

export interface JobDebugState {
  id: number;
  job_id: number;
  paused_at_step: number | null;
  modified_params: Record<string, unknown>;
  intermediate_previews: PreviewEntry[];
  abort_reason: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Preview entry (stored in JSONB array)
   -------------------------------------------------------------------------- */

export interface PreviewEntry {
  step: number;
  timestamp: string;
  url?: string;
  data?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

export interface PauseJobRequest {
  step?: number;
}

export interface ResumeJobRequest {}

export interface UpdateParamsRequest {
  params: Record<string, unknown>;
}

export interface AbortJobRequest {
  reason?: string;
}

/* --------------------------------------------------------------------------
   UI types
   -------------------------------------------------------------------------- */

export type DebugControlAction = "pause" | "resume" | "abort";

export type JobControlStatus = "running" | "paused" | "aborted";

/* --------------------------------------------------------------------------
   Shared styling constants
   -------------------------------------------------------------------------- */

/** Base textarea classes shared across debugger components (DRY-230). */
export const DEBUGGER_TEXTAREA_BASE = [
  "w-full",
  "bg-[var(--color-surface-secondary)]",
  "border border-[var(--color-border-default)]",
  "rounded-[var(--radius-md)]",
  "px-3 py-2 text-sm",
  "text-[var(--color-text-primary)]",
  "placeholder:text-[var(--color-text-muted)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]",
] as const;

/** Card panel classes shared across debugger components (DRY-229). */
export const DEBUGGER_CARD_CLASSES = [
  "bg-[var(--color-surface-primary)]",
  "border border-[var(--color-border-default)]",
  "rounded-[var(--radius-lg)]",
  "p-4",
] as const;
