/**
 * TypeScript types for the Incremental Re-stitching & Smoothing feature (PRD-25).
 *
 * These types mirror the backend API response shapes for segment versioning,
 * boundary checks, and re-stitching actions.
 */

/* --------------------------------------------------------------------------
   Segment version info
   -------------------------------------------------------------------------- */

export interface SegmentVersionInfo {
  id: number;
  scene_id: number;
  sequence_index: number;
  previous_segment_id: number | null;
  regeneration_count: number;
  is_stale: boolean;
  boundary_ssim_before: number | null;
  boundary_ssim_after: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Boundary check result
   -------------------------------------------------------------------------- */

export interface BoundaryCheckResult {
  before_ssim: number | null;
  after_ssim: number | null;
  needs_smoothing_before: boolean;
  needs_smoothing_after: boolean;
}

/* --------------------------------------------------------------------------
   Request / response types
   -------------------------------------------------------------------------- */

export interface RegenerateRequest {
  modified_params?: Record<string, unknown>;
}

export interface RegenerateResponse {
  new_segment_id: number;
  stale_count: number;
}

export interface SmoothBoundaryRequest {
  boundary: "before" | "after";
  method: SmoothingMethod;
}

export interface SmoothBoundaryResponse {
  method: string;
  updated_ssim: number | null;
}

export interface ClearStaleResponse {
  cleared: boolean;
}

/* --------------------------------------------------------------------------
   Enums and constants
   -------------------------------------------------------------------------- */

export type SmoothingMethod = "frame_blending" | "re_extraction" | "manual_accept";

export type BoundaryQuality = "good" | "warning" | "discontinuity";

/** Default SSIM threshold below which a boundary is considered discontinuous.
 *  Sync: canonical source is `core/src/restitching.rs::DEFAULT_SSIM_THRESHOLD` */
export const DEFAULT_SSIM_THRESHOLD = 0.85;

/** SSIM threshold above which a boundary is considered seamless.
 *  Sync: canonical source is `core/src/restitching.rs::SSIM_WARNING_THRESHOLD` */
export const SSIM_WARNING_THRESHOLD = 0.92;

/** Human-readable labels for smoothing methods. */
export const SMOOTHING_METHOD_LABELS: Record<SmoothingMethod, string> = {
  frame_blending: "Frame Blending",
  re_extraction: "Re-extraction",
  manual_accept: "Accept As-Is",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Classify boundary quality from an SSIM score. */
export function classifyBoundaryQuality(
  ssim: number,
  threshold = DEFAULT_SSIM_THRESHOLD,
): BoundaryQuality {
  if (ssim >= SSIM_WARNING_THRESHOLD) return "good";
  if (ssim >= threshold) return "warning";
  return "discontinuity";
}

/** Map boundary quality to a Badge variant from the primitives library. */
export function qualityBadgeVariant(
  quality: BoundaryQuality,
): "success" | "warning" | "danger" {
  switch (quality) {
    case "good":
      return "success";
    case "warning":
      return "warning";
    case "discontinuity":
      return "danger";
  }
}

/** Map boundary quality to a Tailwind-compatible color token. */
export function qualityColor(quality: BoundaryQuality): string {
  switch (quality) {
    case "good":
      return "var(--color-action-success)";
    case "warning":
      return "var(--color-action-warning)";
    case "discontinuity":
      return "var(--color-action-danger)";
  }
}
