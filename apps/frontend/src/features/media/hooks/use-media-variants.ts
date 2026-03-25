/**
 * TanStack Query hooks for media variant management (PRD-21).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateMediaVariantInput,
  GenerateVariantsInput,
  MediaVariant,
  UpdateMediaVariantInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const mediaVariantKeys = {
  all: ["media-variants"] as const,
  lists: () => [...mediaVariantKeys.all, "list"] as const,
  list: (avatarId: number, variantType?: string) =>
    [...mediaVariantKeys.lists(), avatarId, variantType] as const,
  details: () => [...mediaVariantKeys.all, "detail"] as const,
  detail: (avatarId: number, id: number) =>
    [...mediaVariantKeys.details(), avatarId, id] as const,
  histories: () => [...mediaVariantKeys.all, "history"] as const,
  history: (avatarId: number, id: number) =>
    [...mediaVariantKeys.histories(), avatarId, id] as const,
  browse: (projectId?: number, pipelineId?: number, limit?: number, offset?: number) =>
    [...mediaVariantKeys.all, "browse", projectId, pipelineId, limit, offset] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function variantBasePath(avatarId: number): string {
  return `/avatars/${avatarId}/media-variants`;
}

/**
 * Fetch existing variant_type strings for a avatar as a lowercase Set.
 *
 * Shared by the bulk import hook (skip existing) and the duplicate asset
 * info hook (diff badge display).
 */
export async function fetchVariantTypeSet(avatarId: number): Promise<Set<string>> {
  const variants = await api.get<MediaVariant[]>(variantBasePath(avatarId));
  return new Set(
    variants
      .map((v) => v.variant_type?.toLowerCase())
      .filter((t): t is string => t != null),
  );
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all media variants for a avatar, optionally filtered by variant type. */
export function useMediaVariants(avatarId: number, variantType?: string) {
  const params = variantType ? `?variant_type=${encodeURIComponent(variantType)}` : "";
  return useQuery({
    queryKey: mediaVariantKeys.list(avatarId, variantType),
    queryFn: () => api.get<MediaVariant[]>(`${variantBasePath(avatarId)}${params}`),
    enabled: avatarId > 0,
  });
}

/** Fetch a single media variant by id. */
export function useMediaVariant(avatarId: number, id: number | null) {
  return useQuery({
    queryKey: mediaVariantKeys.detail(avatarId, id ?? 0),
    queryFn: () => api.get<MediaVariant>(`${variantBasePath(avatarId)}/${id}`),
    enabled: id !== null && avatarId > 0,
  });
}

/** Fetch the version history chain for a variant. */
export function useVariantHistory(avatarId: number, id: number | null) {
  return useQuery({
    queryKey: mediaVariantKeys.history(avatarId, id ?? 0),
    queryFn: () => api.get<MediaVariant[]>(`${variantBasePath(avatarId)}/${id}/history`),
    enabled: id !== null && avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new media variant via JSON. */
export function useCreateMediaVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMediaVariantInput) =>
      api.post<MediaVariant>(variantBasePath(avatarId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Update an existing media variant. */
export function useUpdateMediaVariant(avatarId: number, id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateMediaVariantInput) =>
      api.put<MediaVariant>(`${variantBasePath(avatarId)}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: mediaVariantKeys.detail(avatarId, id),
      });
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Soft-delete an media variant. */
export function useDeleteMediaVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`${variantBasePath(avatarId)}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Approve a variant as hero for its avatar+variant_type. */
export function useApproveVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Revert an approved or rejected variant back to generated. */
export function useUnapproveVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/unapprove`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Reject a variant. */
export function useRejectVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Approve a variant from the browse page (avatarId provided at call time). */
export function useBrowseApproveVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ avatarId, id }: { avatarId: number; id: number }) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Unapprove/unreject a variant back to generated from the browse page. */
export function useBrowseUnapproveVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ avatarId, id }: { avatarId: number; id: number }) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/unapprove`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Reject a variant from the browse page (avatarId provided at call time). */
export function useBrowseRejectVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ avatarId, id }: { avatarId: number; id: number }) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Export a variant for external editing. */
export function useExportVariant(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<MediaVariant>(`${variantBasePath(avatarId)}/${id}/export`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/** Build FormData and POST an media variant upload. Shared by hook and bulk upload. */
export function postMediaVariantUpload(
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

/** Upload an media variant via multipart form. */
export function useUploadMediaVariant(avatarId: number) {
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
    }) => postMediaVariantUpload(avatarId, file, variant_type, variant_label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
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
      api.post<MediaVariant[]>(`${variantBasePath(avatarId)}/generate`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaVariantKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Browse (cross-avatar)
   -------------------------------------------------------------------------- */

/** A media variant enriched with avatar/project context for browsing. */
export interface MediaVariantBrowseItem {
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
  media_kind: "image" | "video" | "audio";
  notes: string | null;
  duration_secs: number | null;
  created_at: string;
  avatar_name: string;
  avatar_is_enabled: boolean;
  project_id: number;
  project_name: string;
}

/** Paginated browse result for media variants. */
export interface MediaVariantBrowsePage {
  items: MediaVariantBrowseItem[];
  total: number;
}

/** Params for browsing media variants with pagination and server-side filtering. */
export interface MediaVariantBrowseParams {
  projectId?: number;
  pipelineId?: number;
  /** Comma-separated status IDs for OR filtering (e.g., "1,2"). */
  statusId?: string;
  provenance?: string;
  variantType?: string;
  mediaKind?: string;
  showDisabled?: boolean;
  tagIds?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Fetch paginated media variants across avatars/projects, most recent first. */
export function useMediaVariantsBrowse(params: MediaVariantBrowseParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.projectId != null) searchParams.set("project_id", String(params.projectId));
  if (params.pipelineId != null) searchParams.set("pipeline_id", String(params.pipelineId));
  if (params.statusId != null) searchParams.set("status_id", String(params.statusId));
  if (params.provenance) searchParams.set("provenance", params.provenance);
  if (params.variantType) searchParams.set("variant_type", params.variantType);
  if (params.mediaKind) searchParams.set("media_kind", params.mediaKind);
  if (params.showDisabled) searchParams.set("show_disabled", "true");
  if (params.tagIds) searchParams.set("tag_ids", params.tagIds);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["media-variants", "browse", qs],
    queryFn: () => api.get<MediaVariantBrowsePage>(`/media-variants/browse?${qs}`),
  });
}
