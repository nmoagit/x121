import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AvatarDeliverableRow } from "../types";
import { projectKeys } from "./use-projects";

export const deliverableKeys = {
  byProject: (projectId: number) => [...projectKeys.detail(projectId), "deliverables"] as const,
  sceneAssignments: (projectId: number) => [...projectKeys.detail(projectId), "scene-assignments"] as const,
  variantStatuses: (projectId: number) => [...projectKeys.detail(projectId), "variant-statuses"] as const,
  speechLanguageCounts: (projectId: number) => [...projectKeys.detail(projectId), "speech-language-counts"] as const,
};

export function useAvatarDeliverables(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.byProject(projectId),
    queryFn: () => api.get<AvatarDeliverableRow[]>(`/projects/${projectId}/avatar-deliverables`),
    refetchInterval: 15_000,
  });
}

/** Scene assignment for a single avatar+scene_type+track combo. */
export interface BatchSceneAssignment {
  avatar_id: number;
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
 * Fetch scene assignments for ALL avatars in a project in one request.
 * Replaces the N individual dashboard calls in the deliverables matrix.
 */
export function useBatchSceneAssignments(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.sceneAssignments(projectId),
    queryFn: () => api.get<BatchSceneAssignment[]>(`/projects/${projectId}/scene-assignments`),
    refetchInterval: 30_000,
  });
}

/** Lightweight image variant projection for the deliverables matrix. */
export interface BatchVariantStatus {
  avatar_id: number;
  id: number;
  variant_type: string | null;
  status_id: number;
  is_hero: boolean;
}

/**
 * Fetch variant statuses for ALL avatars in a project in one request.
 * Replaces the N individual media-variant calls in the deliverables matrix.
 */
export function useBatchVariantStatuses(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.variantStatuses(projectId),
    queryFn: () => api.get<BatchVariantStatus[]>(`/projects/${projectId}/variant-statuses`),
    refetchInterval: 30_000,
  });
}

/** Speech count per language per avatar (project-level batch). */
export interface ProjectLanguageCount {
  avatar_id: number;
  language_id: number;
  code: string;
  flag_code: string;
  count: number;
}

/**
 * Fetch speech language counts for ALL avatars in a project in one request.
 * Used to render language flags on avatar cards.
 */
export function useSpeechLanguageCounts(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.speechLanguageCounts(projectId),
    queryFn: () => api.get<ProjectLanguageCount[]>(`/projects/${projectId}/speech-language-counts`),
    staleTime: 5 * 60 * 1000,
  });
}
