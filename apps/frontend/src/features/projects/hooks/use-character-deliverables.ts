import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CharacterDeliverableRow } from "../types";
import { projectKeys } from "./use-projects";

export const deliverableKeys = {
  byProject: (projectId: number) => [...projectKeys.detail(projectId), "deliverables"] as const,
  sceneAssignments: (projectId: number) => [...projectKeys.detail(projectId), "scene-assignments"] as const,
  variantStatuses: (projectId: number) => [...projectKeys.detail(projectId), "variant-statuses"] as const,
};

export function useCharacterDeliverables(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.byProject(projectId),
    queryFn: () => api.get<CharacterDeliverableRow[]>(`/projects/${projectId}/character-deliverables`),
  });
}

/** Scene assignment for a single character+scene_type+track combo. */
export interface BatchSceneAssignment {
  character_id: number;
  scene_type_id: number;
  scene_name: string;
  track_id: number;
  track_name: string;
  track_slug: string;
  has_clothes_off_transition: boolean;
  scene_id: number | null;
  status: string;
  segment_count: number;
  final_video_count: number;
}

/**
 * Fetch scene assignments for ALL characters in a project in one request.
 * Replaces the N individual dashboard calls in the deliverables matrix.
 */
export function useBatchSceneAssignments(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.sceneAssignments(projectId),
    queryFn: () => api.get<BatchSceneAssignment[]>(`/projects/${projectId}/scene-assignments`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Lightweight image variant projection for the deliverables matrix. */
export interface BatchVariantStatus {
  character_id: number;
  id: number;
  variant_type: string | null;
  status_id: number;
  is_hero: boolean;
}

/**
 * Fetch variant statuses for ALL characters in a project in one request.
 * Replaces the N individual image-variant calls in the deliverables matrix.
 */
export function useBatchVariantStatuses(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.variantStatuses(projectId),
    queryFn: () => api.get<BatchVariantStatus[]>(`/projects/${projectId}/variant-statuses`),
    staleTime: 5 * 60 * 1000,
  });
}
