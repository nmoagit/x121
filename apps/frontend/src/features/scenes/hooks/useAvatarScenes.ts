/**
 * Hooks for avatar scene listing and creation.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Scene } from "../types";

export const sceneKeys = {
  all: ["scenes"] as const,
  byAvatar: (avatarId: number) =>
    [...sceneKeys.all, "avatar", avatarId] as const,
};

/**
 * Fetch scenes for a avatar.
 *
 * When `hasGenerating` is true the query polls every 3 seconds so that
 * status transitions (e.g. generating → generated) are picked up promptly
 * without waiting for the default staleTime.
 */
export function useAvatarScenes(avatarId: number, hasGenerating = false) {
  return useQuery({
    queryKey: sceneKeys.byAvatar(avatarId),
    queryFn: () =>
      api.get<Scene[]>(`/avatars/${avatarId}/scenes`),
    enabled: avatarId > 0,
    refetchInterval: hasGenerating ? 3000 : false,
  });
}

/* --------------------------------------------------------------------------
   Create scene
   -------------------------------------------------------------------------- */

export interface CreateSceneInput {
  scene_type_id: number;
  image_variant_id?: number | null;
  track_id?: number | null;
  transition_mode?: string;
}

/** Create a new scene for a avatar. */
export function useCreateScene(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneInput) =>
      api.post<Scene>(`/avatars/${avatarId}/scenes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sceneKeys.byAvatar(avatarId),
      });
    },
  });
}
