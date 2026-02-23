/**
 * Storyboard View & Scene Thumbnails types (PRD-62).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A keyframe record from the server. */
export interface Keyframe {
  id: number;
  segment_id: number;
  frame_number: number;
  timestamp_secs: number;
  thumbnail_path: string;
  full_res_path: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a new keyframe. */
export interface CreateKeyframeRequest {
  segment_id: number;
  frame_number: number;
  timestamp_secs: number;
  thumbnail_path: string;
  full_res_path?: string | null;
}

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */

/**
 * Format seconds as a timecode string (MM:SS.f).
 *
 * @example formatTimecode(65.5) => "01:05.5"
 */
export function formatTimecode(secs: number): string {
  const minutes = Math.floor(secs / 60);
  const remainder = secs - minutes * 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = remainder.toFixed(1).padStart(4, "0");
  return `${mm}:${ss}`;
}
