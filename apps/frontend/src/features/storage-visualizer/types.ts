/**
 * Storage Visualizer types (PRD-19).
 *
 * Treemap, breakdown, and summary data structures for the
 * disk-space visualization dashboard.
 */

// ---------------------------------------------------------------------------
// Treemap node (recursive hierarchy)
// ---------------------------------------------------------------------------

/** A single node in the storage treemap hierarchy. */
export interface TreemapNode {
  name: string;
  entity_type: string;
  entity_id: number;
  /** Size in bytes. */
  size: number;
  file_count: number;
  /** Bytes that can be reclaimed (e.g. orphaned files, old versions). */
  reclaimable_bytes: number;
  children: TreemapNode[];
}

// ---------------------------------------------------------------------------
// File type breakdown
// ---------------------------------------------------------------------------

/** Breakdown of storage usage by file type category. */
export interface FileTypeBreakdown {
  category: string;
  total_bytes: number;
  file_count: number;
  /** Fraction of total storage (0-1). */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Storage summary
// ---------------------------------------------------------------------------

/** High-level storage statistics from the latest snapshot. */
export interface StorageSummary {
  total_bytes: number;
  total_files: number;
  reclaimable_bytes: number;
  /** Fraction of total that is reclaimable (0-1). */
  reclaimable_percentage: number;
  /** Number of entities tracked. */
  entity_count: number;
  /** ISO timestamp of the most recent snapshot (null when no snapshots exist). */
  snapshot_at: string | null;
}

// ---------------------------------------------------------------------------
// File type category (lookup)
// ---------------------------------------------------------------------------

/** A file type category entry from the categories endpoint. */
export interface FileTypeCategory {
  id: number;
  name: string;
  description: string | null;
  extensions: string[];
  color: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Color palette for chart categories. */
export const CATEGORY_COLORS: Record<string, string> = {
  video: "#4F46E5",
  image: "#059669",
  intermediate: "#D97706",
  metadata: "#7C3AED",
  model: "#DC2626",
};

/** Human-readable labels for chart categories. */
export const CATEGORY_LABELS: Record<string, string> = {
  video: "Video",
  image: "Images",
  intermediate: "Intermediate",
  metadata: "Metadata",
  model: "AI Models",
};
