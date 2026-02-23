/**
 * TypeScript types for the Multi-Resolution Pipeline feature (PRD-59).
 *
 * These types mirror the backend API response shapes for resolution tiers
 * and upscale operations.
 */

import type { BadgeVariant } from "@/components/primitives/Badge";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

export interface ResolutionTier {
  id: number;
  name: string;
  display_name: string;
  width: number;
  height: number;
  quality_settings: Record<string, unknown>;
  speed_factor: number;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request / response types
   -------------------------------------------------------------------------- */

export interface UpscaleRequest {
  target_tier_id: number;
}

export interface UpscaleResponse {
  original_scene_id: number;
  new_scene_id: number;
  target_tier: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Human-readable labels for each tier name. */
export const TIER_LABELS: Record<string, string> = {
  draft: "Draft",
  preview: "Preview",
  production: "Production",
};

/** Design system color variables for each tier. */
export const TIER_COLORS: Record<string, string> = {
  draft: "var(--color-text-secondary)",
  preview: "var(--color-action-warning)",
  production: "var(--color-action-success)",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Map a tier name to a Badge variant for color-coding. */
export function tierBadgeVariant(name: string): BadgeVariant {
  switch (name) {
    case "production":
      return "success";
    case "preview":
      return "warning";
    default:
      return "default";
  }
}
