/**
 * Scene Preview & Quick Test types (PRD-58).
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A test shot record from the server. */
export interface TestShot {
  id: number;
  scene_type_id: number;
  character_id: number;
  workflow_id: number | null;
  parameters: Record<string, unknown>;
  seed_image_path: string;
  output_video_path: string | null;
  last_frame_path: string | null;
  duration_secs: number | null;
  quality_score: number | null;
  is_promoted: boolean;
  promoted_to_scene_id: number | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for generating a single test shot. */
export interface GenerateTestShotRequest {
  scene_type_id: number;
  character_id: number;
  workflow_id?: number | null;
  parameters?: Record<string, unknown> | null;
  seed_image_path: string;
  duration_secs?: number | null;
}

/** Request body for generating a batch of test shots. */
export interface BatchTestShotRequest {
  scene_type_id: number;
  character_ids: number[];
  workflow_id?: number | null;
  parameters?: Record<string, unknown> | null;
  seed_image_path: string;
  duration_secs?: number | null;
}

/* --------------------------------------------------------------------------
   Response types
   -------------------------------------------------------------------------- */

/** Response after promoting a test shot to a full scene. */
export interface PromoteResponse {
  test_shot_id: number;
  promoted_to_scene_id: number;
}

/** Response after creating a batch of test shots. */
export interface BatchTestShotResponse {
  test_shot_ids: number[];
  count: number;
}

/* --------------------------------------------------------------------------
   Status types
   -------------------------------------------------------------------------- */

/** Test shot lifecycle status. */
export type TestShotStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed"
  | "promoted";

/** Human-readable labels for each test shot status. */
export const TEST_SHOT_STATUS_LABELS: Record<TestShotStatus, string> = {
  pending: "Pending",
  generating: "Generating",
  completed: "Completed",
  failed: "Failed",
  promoted: "Promoted",
};

/** Map a test shot status to its corresponding Badge variant. */
export function testShotStatusVariant(status: TestShotStatus): BadgeVariant {
  switch (status) {
    case "pending":
      return "default";
    case "generating":
      return "info";
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "promoted":
      return "success";
  }
}
