import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RejectClipInput, ResumeFromResponse, SceneVideoVersion } from "../types";
import { sceneKeys } from "./useAvatarScenes";

export const clipKeys = {
  all: ["scene-versions"] as const,
  list: (sceneId: number) => [...clipKeys.all, "list", sceneId] as const,
  detail: (sceneId: number, versionId: number) =>
    [...clipKeys.all, "detail", sceneId, versionId] as const,
  browse: (projectId?: number, pipelineId?: number, limit?: number, offset?: number) =>
    [...clipKeys.all, "browse", projectId, pipelineId, limit, offset] as const,
};

/** A clip enriched with avatar/scene/project context for browsing. */
export interface ClipBrowseItem {
  id: number;
  scene_id: number;
  version_number: number;
  source: "generated" | "imported";
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  preview_path: string | null;
  is_final: boolean;
  notes: string | null;
  qa_status: "pending" | "approved" | "rejected";
  qa_rejection_reason: string | null;
  qa_notes: string | null;
  generation_snapshot: Record<string, unknown> | null;
  file_purged: boolean;
  created_at: string;
  annotation_count: number;
  avatar_id: number;
  avatar_name: string;
  scene_type_name: string;
  track_name: string;
  avatar_is_enabled: boolean;
  project_id: number;
  project_name: string;
}

/** Paginated browse result for scene video clips. */
export interface ClipBrowsePage {
  items: ClipBrowseItem[];
  total: number;
}

/** Params for browsing clips with pagination and server-side filtering. */
export interface ClipBrowseParams {
  projectId?: number;
  pipelineId?: number;
  sceneType?: string;
  track?: string;
  source?: string;
  qaStatus?: string;
  showDisabled?: boolean;
  tagIds?: string;
  excludeTagIds?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Fetch paginated clips across all avatars/scenes, most recent first. */
export function useClipsBrowse(params: ClipBrowseParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.projectId != null) searchParams.set("project_id", String(params.projectId));
  if (params.pipelineId != null) searchParams.set("pipeline_id", String(params.pipelineId));
  if (params.sceneType) searchParams.set("scene_type", params.sceneType);
  if (params.track) searchParams.set("track", params.track);
  if (params.source) searchParams.set("source", params.source);
  if (params.qaStatus) searchParams.set("qa_status", params.qaStatus);
  if (params.showDisabled) searchParams.set("show_disabled", "true");
  if (params.tagIds) searchParams.set("tag_ids", params.tagIds);
  if (params.excludeTagIds) searchParams.set("exclude_tag_ids", params.excludeTagIds);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["scene-versions", "browse", qs],
    queryFn: () => api.get<ClipBrowsePage>(`/scene-video-versions/browse?${qs}`),
  });
}

export function useSceneVersions(sceneId: number) {
  return useQuery({
    queryKey: clipKeys.list(sceneId),
    queryFn: () => api.get<SceneVideoVersion[]>(`/scenes/${sceneId}/versions`),
    enabled: sceneId > 0,
  });
}

export function useSceneVersion(sceneId: number, versionId: number) {
  return useQuery({
    queryKey: clipKeys.detail(sceneId, versionId),
    queryFn: () => api.get<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}`),
    enabled: sceneId > 0 && versionId > 0,
  });
}

export function useApproveClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

export function useUnapproveClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/unapprove`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

export function useRejectClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      input,
    }: {
      versionId: number;
      input: RejectClipInput;
    }) => api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/reject`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

export function useSetFinalClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/set-final`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

export function useResumeFromClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<ResumeFromResponse>(`/scenes/${sceneId}/versions/${versionId}/resume-from`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Approve a clip from the browse page (sceneId provided at call time). */
export function useBrowseApproveClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneId, versionId }: { sceneId: number; versionId: number }) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.all });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Unapprove/unreject a clip back to pending from the browse page. */
export function useBrowseUnapproveClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneId, versionId }: { sceneId: number; versionId: number }) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/unapprove`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.all });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Reject a clip from the browse page (sceneId provided at call time). */
export function useBrowseRejectClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneId, versionId, input }: { sceneId: number; versionId: number; input: RejectClipInput }) =>
      api.put<SceneVideoVersion>(`/scenes/${sceneId}/versions/${versionId}/reject`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.all });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Build a FormData for clip import and POST it. Shared by single and bulk hooks,
 *  as well as standalone bulk-asset-upload functions. */
export function postClipImport(sceneId: number, file: File, notes?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", notes);
  return api.raw(`/scenes/${sceneId}/versions/import`, {
    method: "POST",
    body: formData,
  });
}

export function useDeleteClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.delete(`/scenes/${sceneId}/versions/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

export function useImportClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, notes }: { file: File; notes?: string }) =>
      postClipImport(sceneId, file, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Import a clip with sceneId provided at call time (for bulk operations). */
export function useBulkImportClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sceneId,
      file,
      notes,
    }: {
      sceneId: number;
      file: File;
      notes?: string;
    }) => postClipImport(sceneId, file, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.all });
      // Refresh scene list (video counts, thumbnails) and avatar dashboard
      queryClient.invalidateQueries({ queryKey: sceneKeys.all });
      queryClient.invalidateQueries({ queryKey: ["avatar-dashboard"] });
    },
  });
}

/** Bulk-approve clips by explicit IDs or server-side filters. */
export function useBulkApproveClips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: number[]; filters?: object }) =>
      api.post<{ updated: number }>("/scene-video-versions/bulk-approve", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clipKeys.all });
      qc.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}

/** Bulk-reject clips by explicit IDs or server-side filters. */
export function useBulkRejectClips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: number[]; filters?: object; reason?: string }) =>
      api.post<{ updated: number }>("/scene-video-versions/bulk-reject", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clipKeys.all });
      qc.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}
