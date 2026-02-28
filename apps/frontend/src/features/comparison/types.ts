/**
 * TypeScript types for cross-character scene comparison (PRD-68).
 *
 * Defines the data shape returned by the comparison API endpoints,
 * plus sort/filter options for the gallery view.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   API response types
   -------------------------------------------------------------------------- */

export interface ComparisonCell {
  character_id: number;
  character_name: string;
  scene_id: number;
  segment_id: number | null;
  scene_type_id: number;
  scene_type_name: string;
  image_variant_id: number;
  status_id: number;
  thumbnail_url: string | null;
  stream_url: string | null;
  qa_score: number | null;
  approval_status: "approved" | "rejected" | "flagged" | null;
  duration_secs: number | null;
  created_at: string;
}

export interface ComparisonResponse {
  scene_type_id: number;
  scene_type_name: string;
  cells: ComparisonCell[];
}

/* --------------------------------------------------------------------------
   Sort / filter
   -------------------------------------------------------------------------- */

export type SortField = "character_name" | "qa_score" | "created_at" | "approval_status";
export type SortDirection = "asc" | "desc";

export interface GallerySort {
  field: SortField;
  direction: SortDirection;
}

export interface GalleryFilters {
  status?: "approved" | "rejected" | "flagged" | "unapproved";
  variantId?: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Badge variant for each approval status value. */
export const APPROVAL_BADGE_VARIANT: Record<string, BadgeVariant> = {
  approved: "success",
  rejected: "danger",
  flagged: "warning",
};

/** Sort field options for the gallery toolbar. */
export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "character_name", label: "Character Name" },
  { value: "qa_score", label: "QA Score" },
  { value: "created_at", label: "Generation Date" },
  { value: "approval_status", label: "Approval Status" },
];

/** Status filter options for the gallery toolbar. */
export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "flagged", label: "Flagged" },
  { value: "unapproved", label: "Unapproved" },
];

/** QA threshold above which "Approve All Passing" includes the cell. */
export const APPROVE_ALL_QA_THRESHOLD = 0.8;

/** Segment version used when no specific version is tracked in the cell. */
export const DEFAULT_SEGMENT_VERSION = 1;

/** QA score thresholds for badge variants. */
export const QA_THRESHOLD_GOOD = 0.8;
export const QA_THRESHOLD_FAIR = 0.5;
