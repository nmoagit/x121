/**
 * TanStack Query hooks for per-avatar image instances (PRD-154).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AvatarImage, AvatarImageDetail, CreateAvatarImage, UpdateAvatarImage } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const avatarImageKeys = {
  all: ["avatar-images"] as const,
  lists: () => [...avatarImageKeys.all, "list"] as const,
  list: (avatarId: number) => [...avatarImageKeys.lists(), avatarId] as const,
  detail: (avatarId: number, imageId: number) =>
    [...avatarImageKeys.all, "detail", avatarId, imageId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all images for an avatar with detail info. */
export function useAvatarImages(avatarId: number | null) {
  return useQuery({
    queryKey: avatarImageKeys.list(avatarId ?? 0),
    queryFn: () => api.get<AvatarImageDetail[]>(`/avatars/${avatarId}/images`),
    enabled: avatarId !== null && avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new avatar image instance. */
export function useCreateAvatarImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAvatarImage) =>
      api.post<AvatarImage>(`/avatars/${avatarId}/images`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: avatarImageKeys.list(avatarId) });
    },
  });
}

/** Update an avatar image instance. */
export function useUpdateAvatarImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, ...data }: { imageId: number } & UpdateAvatarImage) =>
      api.put<AvatarImage>(`/avatars/${avatarId}/images/${imageId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: avatarImageKeys.list(avatarId) });
    },
  });
}

/** Soft-delete an avatar image instance. */
export function useDeleteAvatarImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageId: number) =>
      api.delete(`/avatars/${avatarId}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: avatarImageKeys.list(avatarId) });
    },
  });
}

/** Approve a generated avatar image. */
export function useApproveAvatarImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageId: number) =>
      api.post<AvatarImage>(`/avatars/${avatarId}/images/${imageId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: avatarImageKeys.list(avatarId) });
    },
  });
}

/** Reject a generated avatar image. */
export function useRejectAvatarImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageId: number) =>
      api.post<AvatarImage>(`/avatars/${avatarId}/images/${imageId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: avatarImageKeys.list(avatarId) });
    },
  });
}
