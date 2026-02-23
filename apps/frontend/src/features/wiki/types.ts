/**
 * TypeScript types for the Studio Wiki & Contextual Help feature (PRD-56).
 *
 * These types mirror the backend API response shapes for wiki articles,
 * versions, diffs, and contextual help mappings.
 */

/* --------------------------------------------------------------------------
   Wiki articles
   -------------------------------------------------------------------------- */

export interface WikiArticle {
  id: number;
  title: string;
  slug: string;
  content_md: string;
  category: string | null;
  tags: string[] | null;
  is_builtin: boolean;
  is_pinned: boolean;
  pin_location: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWikiArticle {
  title: string;
  slug?: string;
  content_md: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  pin_location?: string;
}

export interface UpdateWikiArticle {
  title?: string;
  content_md?: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  pin_location?: string;
  edit_summary?: string;
}

/* --------------------------------------------------------------------------
   Wiki versions
   -------------------------------------------------------------------------- */

export interface WikiVersion {
  id: number;
  article_id: number;
  version: number;
  content_md: string;
  edited_by: number | null;
  edit_summary: string | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Diff types
   -------------------------------------------------------------------------- */

export type DiffLineType = "added" | "removed" | "unchanged";

export interface DiffLine {
  line_type: DiffLineType;
  content: string;
}

export interface DiffResponse {
  article_id: number;
  slug: string;
  v1: number;
  v2: number;
  lines: DiffLine[];
}

/* --------------------------------------------------------------------------
   Contextual help
   -------------------------------------------------------------------------- */

export interface ContextualHelpResponse {
  element_id: string;
  article: WikiArticle | null;
}

/** Mapping from UI element IDs to help article slugs. */
export type ContextualHelpMapping = Record<string, string>;

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

export type WikiCategory =
  | "platform"
  | "workflow"
  | "troubleshooting"
  | "tutorial"
  | "reference";

export const CATEGORY_LABELS: Record<WikiCategory, string> = {
  platform: "Platform",
  workflow: "Workflow",
  troubleshooting: "Troubleshooting",
  tutorial: "Tutorial",
  reference: "Reference",
};

export type PinLocation = "dashboard";

export const PIN_LOCATION_LABELS: Record<PinLocation, string> = {
  dashboard: "Dashboard",
};

/* --------------------------------------------------------------------------
   Helper functions
   -------------------------------------------------------------------------- */

/** Map a category to a human-readable label. */
export function categoryLabel(category: string | null): string {
  if (!category) return "Uncategorized";
  return (
    CATEGORY_LABELS[category as WikiCategory] ?? category
  );
}
