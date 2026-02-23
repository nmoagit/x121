/**
 * TypeScript types for Character Duplicate Detection (PRD-79).
 *
 * These types mirror the backend API response shapes for duplicate checks,
 * match responses, detection settings, and request DTOs.
 */

/* --------------------------------------------------------------------------
   Duplicate checks
   -------------------------------------------------------------------------- */

export interface DuplicateCheck {
  id: number;
  status_id: number;
  source_character_id: number;
  matched_character_id: number | null;
  similarity_score: number | null;
  threshold_used: number;
  check_type: string;
  resolution: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateMatchResponse {
  check_id: number;
  matched_character_id: number;
  matched_character_name: string;
  similarity_score: number;
}

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

export interface DuplicateDetectionSetting {
  id: number;
  project_id: number | null;
  similarity_threshold: number;
  auto_check_on_upload: boolean;
  auto_check_on_batch: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateDuplicateSetting {
  similarity_threshold?: number;
  auto_check_on_upload?: boolean;
  auto_check_on_batch?: boolean;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

export interface CheckDuplicateRequest {
  character_id: number;
  project_id?: number;
}

export interface BatchCheckRequest {
  character_ids: number[];
  project_id?: number;
}

export interface ResolveCheckRequest {
  resolution: string;
  target_character_id?: number;
}

/* --------------------------------------------------------------------------
   Constants and labels
   -------------------------------------------------------------------------- */

/** Human-readable labels for duplicate check statuses. */
export const CHECK_STATUS_LABELS: Record<number, string> = {
  1: "No Match",
  2: "Match Found",
  3: "Confirmed Duplicate",
  4: "Dismissed",
  5: "Merged",
};

/** Human-readable labels for resolution types. */
export const RESOLUTION_LABELS: Record<string, string> = {
  create_new: "Create as New",
  merge: "Merge",
  dismiss: "Dismiss",
  skip: "Skip",
};
