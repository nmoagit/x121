/**
 * TanStack Query hooks for character speeches (PRD-124).
 *
 * Covers speech types and per-character speech entries.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterSpeech,
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
  list: (characterId: number) => ["characters", characterId, "speeches"] as const,
  completeness: (characterId: number) => ["characters", characterId, "speech-completeness"] as const,
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
   Character speech hooks
   -------------------------------------------------------------------------- */

export function useCharacterSpeeches(characterId: number) {
  return useQuery({
    queryKey: speechKeys.list(characterId),
    queryFn: () => api.get<CharacterSpeech[]>(`/characters/${characterId}/speeches`),
    enabled: characterId > 0,
  });
}

export function useCreateSpeech(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { speech_type_id: number; text: string; language_id?: number }) =>
      api.post<CharacterSpeech>(`/characters/${characterId}/speeches`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(characterId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(characterId) });
    },
  });
}

export function useUpdateSpeech(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ speechId, text }: { speechId: number; text: string }) =>
      api.put<CharacterSpeech>(`/characters/${characterId}/speeches/${speechId}`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(characterId) }),
  });
}

export function useDeleteSpeech(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (speechId: number) =>
      api.delete(`/characters/${characterId}/speeches/${speechId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(characterId) }),
  });
}

export function useImportSpeeches(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { format: string; data: string }) =>
      api.post<ImportSpeechesResponse>(`/characters/${characterId}/speeches/import`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(characterId) });
      qc.invalidateQueries({ queryKey: speechKeys.types() });
    },
  });
}

export function useExportSpeeches(characterId: number) {
  return useMutation({
    mutationFn: (format: string) =>
      api.post<string>(`/characters/${characterId}/speeches/export`, { format }),
  });
}

/* --------------------------------------------------------------------------
   Approval & status hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useUpdateSpeechStatus(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ speechId, status_id }: { speechId: number; status_id: number }) =>
      api.put<CharacterSpeech>(`/characters/${characterId}/speeches/${speechId}/status`, {
        status_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(characterId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(characterId) });
    },
  });
}

export function useBulkApproveSpeeches(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters?: { language_id?: number; type_id?: number }) => {
      const params = new URLSearchParams();
      if (filters?.language_id) params.set("language_id", String(filters.language_id));
      if (filters?.type_id) params.set("type_id", String(filters.type_id));
      const qs = params.toString();
      return api.post<{ updated: number }>(
        `/characters/${characterId}/speeches/bulk-approve${qs ? `?${qs}` : ""}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: speechKeys.list(characterId) });
      qc.invalidateQueries({ queryKey: speechKeys.completeness(characterId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Reorder hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useReorderSpeeches(characterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) =>
      api.put(`/characters/${characterId}/speeches/reorder`, { ordered_ids: orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(characterId) }),
  });
}

/* --------------------------------------------------------------------------
   Deliverable & completeness hooks (PRD-136)
   -------------------------------------------------------------------------- */

export function useGenerateDeliverable(characterId: number) {
  return useMutation({
    mutationFn: () =>
      api.post<SpeechDeliverable>(`/characters/${characterId}/speeches/deliverable`),
  });
}

export function useSpeechCompleteness(characterId: number) {
  return useQuery({
    queryKey: speechKeys.completeness(characterId),
    queryFn: () => api.get<CompletenessSummary>(`/characters/${characterId}/speeches/completeness`),
    enabled: characterId > 0,
  });
}
