/**
 * Segment Trimming & Frame-Level Editing types (PRD-78).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A segment trim record from the server. */
export interface SegmentTrim {
  id: number;
  segment_id: number;
  original_path: string;
  trimmed_path: string | null;
  in_frame: number;
  out_frame: number;
  total_original_frames: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a single trim on a segment. */
export interface CreateTrimRequest {
  segment_id: number;
  original_path: string;
  in_frame: number;
  out_frame: number;
  total_original_frames: number;
}

/** Request body for applying a trim to multiple segments at once. */
export interface BatchTrimRequest {
  segment_ids: number[];
  in_frame: number;
  out_frame: number;
}

/** Request body for applying a quick trim preset to a segment. */
export interface ApplyPresetRequest {
  segment_id: number;
  preset: string;
  total_frames: number;
}

/* --------------------------------------------------------------------------
   Response types
   -------------------------------------------------------------------------- */

/** Response returned after a batch trim operation. */
export interface BatchTrimResponse {
  trim_ids: number[];
  count: number;
}

/** Response describing the seed frame impact of a trim. */
export interface SeedFrameUpdate {
  segment_id: number;
  new_seed_frame: number;
  downstream_segment_id: number | null;
  downstream_invalidated: boolean;
}

/* --------------------------------------------------------------------------
   Preset definitions
   -------------------------------------------------------------------------- */

/** Available quick trim presets. */
export const TRIM_PRESETS = [
  { label: "First 3 frames", value: "first_3", frames: 3 },
  { label: "First 5 frames", value: "first_5", frames: 5 },
  { label: "First 10 frames", value: "first_10", frames: 10 },
  { label: "Last 3 frames", value: "last_3", frames: 3 },
  { label: "Last 5 frames", value: "last_5", frames: 5 },
  { label: "Last 10 frames", value: "last_10", frames: 10 },
] as const;

/** A single trim preset definition. */
export type TrimPreset = (typeof TRIM_PRESETS)[number];
