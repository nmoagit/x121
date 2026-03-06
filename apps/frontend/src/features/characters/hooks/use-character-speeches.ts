/**
 * TanStack Query hooks for character speeches (PRD-124).
 *
 * Covers speech types and per-character speech entries.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CharacterSpeech, ImportSpeechesResponse, SpeechType } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const speechKeys = {
  types: () => ["speech-types"] as const,
  list: (characterId: number) => ["characters", characterId, "speeches"] as const,
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
    mutationFn: (input: { speech_type_id: number; text: string }) =>
      api.post<CharacterSpeech>(`/characters/${characterId}/speeches`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechKeys.list(characterId) }),
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
