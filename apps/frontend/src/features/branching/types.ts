/**
 * Content Branching & Exploration types (PRD-50).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A branch record from the server. */
export interface Branch {
  id: number;
  scene_id: number;
  parent_branch_id: number | null;
  name: string;
  description: string | null;
  is_default: boolean;
  depth: number;
  parameters_snapshot: Record<string, unknown>;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a new branch. */
export interface CreateBranch {
  name: string;
  description?: string | null;
  parameters_snapshot: Record<string, unknown>;
}

/** Request body for updating a branch. */
export interface UpdateBranch {
  name?: string | null;
  description?: string | null;
  parameters_snapshot?: Record<string, unknown> | null;
}

/** Request body for promoting a branch. */
export interface PromoteRequest {
  branch_id: number;
}

/* --------------------------------------------------------------------------
   Response types
   -------------------------------------------------------------------------- */

/** A branch enriched with segment count. */
export interface BranchWithStats extends Branch {
  segment_count: number;
}

/** Side-by-side comparison response. */
export interface BranchComparison {
  branch_a: BranchWithStats;
  branch_b: BranchWithStats;
  diffs: ParameterDiff[];
}

/** A single parameter difference. */
export interface ParameterDiff {
  key: string;
  value_a: string | null;
  value_b: string | null;
  status: "added" | "removed" | "changed" | "unchanged";
}
