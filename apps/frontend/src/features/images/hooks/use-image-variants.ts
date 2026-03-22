/**
 * TanStack Query hooks for image variant management (PRD-21).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateImageVariantInput,
  GenerateVariantsInput,
  ImageVariant,
  UpdateImageVariantInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const imageVariantKeys = {
  all: ["image-variants"] as const,
  lists: () => [...imageVariantKeys.all, "list"] as const,
  list: (avatarId: number, variantType?: string) =>
    [...imageVariantKeys.lists(), avatarId, variantType] as const,
  details: () => [...imageVariantKeys.all, "detail"] as const,
  detail: (avatarId: number, id: number) =>
    [...imageVariantKeys.details(), avatarId, id] as const,
  histories: () => [...imageVariantKeys.all, "history"] as const,
  history: (avatarId: number, id: number) =>
    [...imageVariantKeys.histories(), avatarId, id] as const,
  browse: (projectId?: number, limit?: number, offset?: number) =>
    [...imageVariantKeys.all, "browse", projectId, limit, offset] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function variantBasePath(avatarId: number): string {
  return `/avatars/${avatarId}/image-variants`;
}

/**
 * Fetch existing variant_type strings for a avatar as a lowercase Set.
 *
 * Shared by the bulk import hook (skip existing) and the duplicate asset
 * info hook (diff badge display).
 */
export async function fetchVariantTypeSet(avatarId: number): Promise<Set<string>> {
  const variants = await api.get<ImageVariant[]>(variantBasePath(avatarId));
  return new Set(
    variants
      .map((v) => v.variant_type?.toLowerCase())
      .filter((t): t is string => t != null),
  );
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all image variants for a avatar, optionally filtered by variant type. */
export function useImageVariants(avatarId: number, variantType?: string) {
  const params = variantType ? `?variant_type=${encodeURIComponent(variantType)}` : "";
  return useQuery({
    queryKey: imageVariantKeys.list(avatarId, variantType),
    queryFn: () => api.get<ImageVariant[]>(`${variantBasePath(avatarId)}${params}`),
    enabled: avatarId > 0,
  });
}

/** Fetch a single image variant by id. */
export function useImageVariant(avatarId: number, id: number | null) {
  return useQuery({
    queryKey: imageVariantKeys.detail(avatarId, id ?? 0),
    queryFn: () => api.get<ImageVariant>(`${variantBasePath(avatarId)}/${id}`),
    enabled: id !== null && avatarId > 0,
  });
}

/** Fetch the version history chain for a variant. */
export function useVariantHistory(avatarId: number, id: number | null) {
  return useQuery({
    queryKey: imageVariantKeys.history(avatarId, id ?? 0),
    queryFn: () => api.get<ImageVariant[]>(`${variantBasePath(avatarId)}/${id}/history`),
    enabled: id !== null && avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new image variant via JSON. */
export function useCreateImageVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateImageVariantInput) =>
      api.post<ImageVariant>(variantBasePath(avatarId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Update an existing image variant. */
export function useUpdateImageVariant(avatarId: number, id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateImageVariantInput) =>
      api.put<ImageVariant>(`${variantBasePath(avatarId)}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantKeys.detail(avatarId, id),
      });
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Soft-delete an image variant. */
export function useDeleteImageVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`${variantBasePath(avatarId)}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Approve a variant as hero for its avatar+variant_type. */
export function useApproveVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(avatarId)}/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Revert an approved or rejected variant back to generated. */
export function useUnapproveVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(avatarId)}/${id}/unapprove`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Reject a variant. */
export function useRejectVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(avatarId)}/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Export a variant for external editing. */
export function useExportVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(avatarId)}/${id}/export`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Build FormData and POST an image variant upload. Shared by hook and bulk upload. */
export function postImageVariantUpload(
  avatarId: number,
  file: File,
  variantType: string,
  variantLabel?: string,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("variant_type", variantType);
  if (variantLabel) formData.append("variant_label", variantLabel);

  return api.raw(`${variantBasePath(avatarId)}/upload`, {
    method: "POST",
    body: formData,
  });
}

/** Upload an image variant via multipart form. */
export function useUploadImageVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      variant_type,
      variant_label,
    }: {
      file: File;
      variant_type: string;
      variant_label?: string;
    }) => postImageVariantUpload(avatarId, file, variant_type, variant_label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
      // Refresh avatar lists so hero_variant_id (card avatar) and
      // seed data indicators update immediately after image upload.
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.includes("avatars") &&
          query.queryKey.includes("list"),
      });
    },
  });
}

/** Generate variants via ComfyUI. */
export function useGenerateVariants(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateVariantsInput) =>
      api.post<ImageVariant[]>(`${variantBasePath(avatarId)}/generate`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Browse (cross-avatar)
   -------------------------------------------------------------------------- */

/** An image variant enriched with avatar/project context for browsing. */
export interface ImageVariantBrowseItem {
  id: number;
  avatar_id: number;
  variant_label: string;
  status_id: number;
  file_path: string;
  variant_type: string | null;
  provenance: string;
  is_hero: boolean;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  version: number;
  created_at: string;
  avatar_name: string;
  avatar_is_enabled: boolean;
  project_id: number;
  project_name: string;
}

/** Paginated browse result for image variants. */
export interface ImageVariantBrowsePage {
  items: ImageVariantBrowseItem[];
  total: number;
}

/** Params for browsing image variants with pagination. */
export interface ImageVariantBrowseParams {
  projectId?: number;
  limit?: number;
  offset?: number;
}

/** Fetch paginated image variants across avatars/projects, most recent first. */
export function useImageVariantsBrowse(params: ImageVariantBrowseParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.projectId != null) searchParams.set("project_id", String(params.projectId));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return useQuery({
    queryKey: imageVariantKeys.browse(params.projectId, params.limit, params.offset),
    queryFn: () => api.get<ImageVariantBrowsePage>(`/image-variants/browse?${qs}`),
  });
}
