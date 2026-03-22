/**
 * Avatar Readiness API functions (PRD-107).
 */

import { api } from "@/lib/api";

import type {
  BatchEvaluateRequest,
  AvatarReadinessCache,
  CreateReadinessCriteria,
  ReadinessCriteria,
  ReadinessSummary,
  UpdateReadinessCriteria,
} from "./types";

/** Fetch readiness for a single avatar. */
export function fetchAvatarReadiness(
  avatarId: number,
): Promise<AvatarReadinessCache> {
  return api.get(`/avatars/${avatarId}/readiness`);
}

/** Invalidate the readiness cache for a avatar. */
export function invalidateAvatarReadiness(
  avatarId: number,
): Promise<void> {
  return api.post(`/avatars/${avatarId}/readiness/invalidate`);
}

/** Batch evaluate readiness for multiple avatars. */
export function batchEvaluateReadiness(
  body: BatchEvaluateRequest,
): Promise<AvatarReadinessCache[]> {
  return api.post("/avatars/readiness/batch-evaluate", body);
}

/** Fetch readiness summary for a project or the whole library. */
export function fetchReadinessSummary(
  projectId?: number,
): Promise<ReadinessSummary> {
  const qs = projectId != null ? `?project_id=${projectId}` : "";
  return api.get(`/library/avatars/readiness-summary${qs}`);
}

/** List all readiness criteria. */
export function fetchCriteria(): Promise<ReadinessCriteria[]> {
  return api.get("/readiness-criteria");
}

/** Create a new readiness criteria. */
export function createCriteria(
  input: CreateReadinessCriteria,
): Promise<ReadinessCriteria> {
  return api.post("/readiness-criteria", input);
}

/** Update an existing readiness criteria. */
export function updateCriteria(
  id: number,
  input: UpdateReadinessCriteria,
): Promise<ReadinessCriteria> {
  return api.put(`/readiness-criteria/${id}`, input);
}

/** Delete a readiness criteria. */
export function deleteCriteria(id: number): Promise<void> {
  return api.delete(`/readiness-criteria/${id}`);
}
