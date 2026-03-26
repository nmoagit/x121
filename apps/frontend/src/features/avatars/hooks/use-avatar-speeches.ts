/**
 * TanStack Query hooks for avatar speeches (PRD-124).
 *
 * Covers speech types and per-avatar speech entries.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AvatarSpeech,
  CompletenessSummary,
  ImportSpeechesResponse,
  SpeechDeliverable,
  SpeechType,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const speechKeys = {
  types: () => ["speech-types"] as const,
  list: (avatarId: number) => ["avatars", avatarId, "speeches"] as const,
  completeness: (avatarId: number) => ["avatars", avatarId, "speech-completeness"] as const,
};

/* --------------------------------------------------------------------------
   Speech type hooks
   -------------------------------------------------------------------------- */

export function useSpeechTypes() {
  return useQuery({
    queryKey: speechKeys.types(),
    queryFn: () => api.get<SpeechType[]>("/speech-types"),
  });
}

export function useCreateSpeechType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<SpeechType>("/speech-types", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.types() }),
  });
}

/* --------------------------------------------------------------------------
   Avatar speech hooks
   -------------------------------------------------------------------------- */

export function useAvatarSpeeches(avatarId: number) {
  return useQuery({
    queryKey: speechKeys.list(avatarId),
    queryFn: () => api.get<AvatarSpeech[]>(`/avatars/${avatarId}/speeches`),
    enabled: avatarId > 0,
  });
}

export function useCreateSpeech(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { speech_type_id: number; text: string; language_id?: number }) =>
      api.post<AvatarSpeech>(`/avatars/${avatarId}/speeches`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(avatarId) });
    },
  });
}

export function useUpdateSpeech(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ speechId, text }: { speechId: number; text: string }) =>
      api.put<AvatarSpeech>(`/avatars/${avatarId}/speeches/${speechId}`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) }),
  });
}

export function useDeleteSpeech(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (speechId: number) =>
      api.delete(`/avatars/${avatarId}/speeches/${speechId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) }),
  });
}

export function useImportSpeeches(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { format: string; data: string }) =>
      api.post<ImportSpeechesResponse>(`/avatars/${avatarId}/speeches/import`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) });
      qc.invalidateQueries({ queryKey: speechKeys.types() });
    },
  });
}

export function useExportSpeeches(avatarId: number) {
  return useMutation({
    mutationFn: (format: string) =>
      api.post<string>(`/avatars/${avatarId}/speeches/export`, { format }),
  });
}

/* --------------------------------------------------------------------------
   Approval & status hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useUpdateSpeechStatus(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ speechId, status_id }: { speechId: number; status_id: number }) =>
      api.put<AvatarSpeech>(`/avatars/${avatarId}/speeches/${speechId}/status`, {
        status_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(avatarId) });
    },
  });
}

export function useBulkApproveSpeeches(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters?: { language_id?: number; type_id?: number }) => {
      const params = new URLSearchParams();
      if (filters?.language_id) params.set("language_id", String(filters.language_id));
      if (filters?.type_id) params.set("type_id", String(filters.type_id));
      const qs = params.toString();
      return api.post<{ updated: number }>(
        `/avatars/${avatarId}/speeches/bulk-approve${qs ? `?${qs}` : ""}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(avatarId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Reorder hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useReorderSpeeches(avatarId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) =>
      api.put(`/avatars/${avatarId}/speeches/reorder`, { speech_ids: orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(avatarId) }),
  });
}

/* --------------------------------------------------------------------------
   Deliverable & completeness hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useGenerateDeliverable(avatarId: number) {
  return useMutation({
    mutationFn: () =>
      api.post<SpeechDeliverable>(`/avatars/${avatarId}/speeches/deliverable`),
  });
}

export function useSpeechCompleteness(avatarId: number) {
  return useQuery({
    queryKey: speechKeys.completeness(avatarId),
    queryFn: () => api.get<CompletenessSummary>(`/avatars/${avatarId}/speeches/completeness`),
    enabled: avatarId > 0,
  });
}
