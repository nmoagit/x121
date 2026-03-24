/**
 * TanStack Query hooks for avatar media assignments (PRD-146).
 *
 * Covers workflow media slots and per-avatar media assignments
 * for the dynamic generation seeds system.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface WorkflowMediaSlot {
  id: number;
  workflow_id: number;
  node_id: string;
  input_name: string;
  class_type: string;
  slot_label: string;
  media_type: string;
  is_required: boolean;
  fallback_mode: string | null;
  fallback_value: string | null;
  sort_order: number;
  description: string | null;
  seed_slot_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvatarMediaAssignment {
  id: number;
  avatar_id: number;
  media_slot_id: number;
  scene_type_id: number | null;
  track_id: number | null;
  media_variant_id: number | null;
  file_path: string | null;
  media_type: string;
  is_passthrough: boolean;
  passthrough_track_id: number | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SeedSlotWithAssignment {
  scene_type_id: number;
  scene_type_name: string;
  track_id: number;
  track_name: string;
  workflow_name: string | null;
  media_slot_id: number | null;
  assignment: AvatarMediaAssignment | null;
}

export interface SeedSummary {
  slots: SeedSlotWithAssignment[];
}

interface AssignMediaPayload {
  media_slot_id: number;
  scene_type_id?: number | null;
  track_id?: number | null;
  media_variant_id?: number | null;
  file_path?: string | null;
  media_type?: string;
  is_passthrough?: boolean;
  passthrough_track_id?: number | null;
  notes?: string | null;
}

interface UpdateAssignmentPayload {
  assignmentId: number;
  data: Partial<Omit<AvatarMediaAssignment, "id" | "avatar_id" | "created_at" | "updated_at" | "created_by">>;
}

export interface AutoAssignEntry {
  scene_type_id: number;
  scene_type_name: string;
  track_id: number;
  track_name: string;
  media_variant_id: number;
  variant_label: string;
}

export interface SkippedSlot {
  scene_type_name: string;
  track_name: string;
  reason: string;
}

export interface AutoAssignResult {
  assigned: AutoAssignEntry[];
  skipped: SkippedSlot[];
  total_slots: number;
  total_assigned: number;
  total_skipped: number;
}

interface AutoAssignInput {
  dry_run?: boolean;
  overwrite_existing?: boolean;
}

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const mediaAssignmentKeys = {
  all: (avatarId: number) => ["avatars", avatarId, "media-assignments"] as const,
  seedSummary: (avatarId: number) => ["avatars", avatarId, "seed-summary"] as const,
  list: (avatarId: number) => [...mediaAssignmentKeys.all(avatarId), "list"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch combined seed summary (slots + assignments) for an avatar. */
export function useAvatarSeedSummary(avatarId: number) {
  return useQuery({
    queryKey: mediaAssignmentKeys.seedSummary(avatarId),
    queryFn: () => api.get<SeedSummary>(`/avatars/${avatarId}/seed-summary`),
    enabled: avatarId > 0,
  });
}

/** Fetch all media assignments for an avatar. */
export function useAvatarMediaAssignments(avatarId: number) {
  return useQuery({
    queryKey: mediaAssignmentKeys.list(avatarId),
    queryFn: () => api.get<AvatarMediaAssignment[]>(`/avatars/${avatarId}/media-assignments`),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Upsert (POST) a media assignment for an avatar. */
export function useAssignMedia(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AssignMediaPayload) =>
      api.post<AvatarMediaAssignment>(`/avatars/${avatarId}/media-assignments`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.seedSummary(avatarId) });
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.list(avatarId) });
    },
  });
}

/** Update (PUT) an existing media assignment. */
export function useUpdateMediaAssignment(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, data }: UpdateAssignmentPayload) =>
      api.put<AvatarMediaAssignment>(`/avatars/${avatarId}/media-assignments/${assignmentId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.seedSummary(avatarId) });
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.list(avatarId) });
    },
  });
}

/** Remove (DELETE) a media assignment. */
export function useRemoveMediaAssignment(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId: number) =>
      api.delete(`/avatars/${avatarId}/media-assignments/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.seedSummary(avatarId) });
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.list(avatarId) });
    },
  });
}

/** Auto-assign best-match variants to all seed slots (PRD-147). */
export function useAutoAssignSeeds(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AutoAssignInput) =>
      api.post<AutoAssignResult>(`/avatars/${avatarId}/actions/auto-assign-seeds`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.seedSummary(avatarId) });
      queryClient.invalidateQueries({ queryKey: mediaAssignmentKeys.list(avatarId) });
    },
  });
}
