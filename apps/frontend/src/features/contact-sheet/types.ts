/**
 * TypeScript types for Character Face Contact Sheet (PRD-103).
 *
 * These types mirror the backend API response shapes for contact sheet
 * images, face crop metadata, and export formats.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface ContactSheetImage {
  id: number;
  character_id: number;
  scene_id: number;
  face_crop_path: string;
  confidence_score: number | null;
  frame_number: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface CreateContactSheetImageInput {
  scene_id: number;
  face_crop_path: string;
  confidence_score?: number;
  frame_number?: number;
}

/* --------------------------------------------------------------------------
   Export format
   -------------------------------------------------------------------------- */

export type ExportFormat = "png" | "pdf";

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  png: "PNG Image",
  pdf: "PDF Document",
};

/* --------------------------------------------------------------------------
   Grid column options
   -------------------------------------------------------------------------- */

export const GRID_COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;

export type GridColumns = (typeof GRID_COLUMN_OPTIONS)[number];

export const DEFAULT_GRID_COLUMNS: GridColumns = 4;

/* --------------------------------------------------------------------------
   Confidence score display (DRY-495)
   -------------------------------------------------------------------------- */

/**
 * Thresholds for mapping a 0-1 confidence score to badge variants.
 *
 * Contact sheet uses stricter thresholds than consistency reports
 * (0.9 vs 0.85 for "good") because face detection confidence has
 * a narrower useful range.
 */
export const CONFIDENCE_THRESHOLDS = {
  good: 0.9,
  warning: 0.7,
} as const;

/** Map a 0-1 confidence score to a Badge variant. */
export function confidenceBadgeVariant(score: number): BadgeVariant {
  if (score >= CONFIDENCE_THRESHOLDS.good) return "success";
  if (score >= CONFIDENCE_THRESHOLDS.warning) return "warning";
  return "danger";
}
