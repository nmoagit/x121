import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RejectClipInput, ResumeFromResponse, SceneVideoVersion } from "../types";

export const clipKeys = {
  all: ["scene-versions"] as const,
  list: (sceneId: number) => [...clipKeys.all, "list", sceneId] as const,
  detail: (sceneId: number, versionId: number) =>
    [...clipKeys.all, "detail", sceneId, versionId] as const,
};

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
    },
  });
}

/** Build a FormData for clip import and POST it. Shared by single and bulk hooks. */
function postClipImport(sceneId: number, file: File, notes?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", notes);
  return api.raw(`/scenes/${sceneId}/versions/import`, {
    method: "POST",
    body: formData,
  });
}

export function useImportClip(sceneId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, notes }: { file: File; notes?: string }) =>
      postClipImport(sceneId, file, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clipKeys.list(sceneId) });
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
    },
  });
}
