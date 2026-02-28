/**
 * Segment Regeneration Comparison types (PRD-101).
 *
 * Defines the data shapes for segment version history, side-by-side
 * comparison, quick-action decisions, and batch review summaries.
 */

/* --------------------------------------------------------------------------
   Segment version
   -------------------------------------------------------------------------- */

/** A segment version record from the server. */
export interface SegmentVersion {
  id: number;
  segment_id: number;
  version_number: number;
  video_path: string;
  thumbnail_path: string | null;
  qa_scores_json: Record<string, number> | null;
  params_json: Record<string, unknown> | null;
  selected: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Comparison
   -------------------------------------------------------------------------- */

/** Comparison data for two versions. */
export interface VersionComparison {
  old_version: SegmentVersion;
  new_version: SegmentVersion;
  score_diffs: Record<string, number> | null;
}

/* --------------------------------------------------------------------------
   Decisions
   -------------------------------------------------------------------------- */

/** Quick action decisions. */
export type ComparisonDecision = "keep_new" | "revert" | "keep_both";

/** Batch comparison summary. */
export interface BatchSummary {
  kept_new: number;
  reverted: number;
  kept_both: number;
  skipped: number;
  total: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

export const DECISION_KEEP_NEW = "keep_new" as const;
export const DECISION_REVERT = "revert" as const;
export const DECISION_KEEP_BOTH = "keep_both" as const;
