/**
 * Production Notes TanStack Query hooks (PRD-95).
 *
 * Provides hooks for CRUD operations on production notes and categories,
 * plus search, pin toggle, and resolve/unresolve mutations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateNoteCategory,
  CreateProductionNote,
  NoteCategory,
  NoteEntityType,
  ProductionNote,
  UpdateProductionNote,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const productionNoteKeys = {
  all: ["production-notes"] as const,
  byEntity: (entityType: NoteEntityType, entityId: number) =>
    ["production-notes", "entity", entityType, entityId] as const,
  pinned: (entityType: NoteEntityType, entityId: number) =>
    ["production-notes", "pinned", entityType, entityId] as const,
  thread: (noteId: number) =>
    ["production-notes", "thread", noteId] as const,
  search: (q: string) => ["production-notes", "search", q] as const,
  categories: ["production-notes", "categories"] as const,
  detail: (id: number) => ["production-notes", "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List notes for a specific entity. */
export function useProductionNotes(
  entityType: NoteEntityType,
  entityId: number,
  params?: { limit?: number; offset?: number },
) {
  const qs = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
  });
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));

  return useQuery({
    queryKey: productionNoteKeys.byEntity(entityType, entityId),
    queryFn: () => api.get<ProductionNote[]>(`/notes?${qs.toString()}`),
    enabled: entityId > 0,
  });
}

/** List pinned notes for a specific entity. */
export function usePinnedNotes(
  entityType: NoteEntityType,
  entityId: number,
) {
  const qs = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
  });

  return useQuery({
    queryKey: productionNoteKeys.pinned(entityType, entityId),
    queryFn: () => api.get<ProductionNote[]>(`/notes/pinned?${qs.toString()}`),
    enabled: entityId > 0,
  });
}

/** Get a single note by ID. */
export function useProductionNote(id: number) {
  return useQuery({
    queryKey: productionNoteKeys.detail(id),
    queryFn: () => api.get<ProductionNote>(`/notes/${id}`),
    enabled: id > 0,
  });
}

/** List replies (thread) for a note. */
export function useNoteThread(noteId: number) {
  return useQuery({
    queryKey: productionNoteKeys.thread(noteId),
    queryFn: () => api.get<ProductionNote[]>(`/notes/${noteId}/thread`),
    enabled: noteId > 0,
  });
}

/** Search notes by content, optionally filtered by entity type. */
export function useSearchNotes(q: string, entityType?: NoteEntityType) {
  const qs = new URLSearchParams({ q });
  if (entityType) qs.set("entity_type", entityType);

  return useQuery({
    queryKey: productionNoteKeys.search(q),
    queryFn: () => api.get<ProductionNote[]>(`/notes/search?${qs.toString()}`),
    enabled: q.length > 0,
  });
}

/** List all note categories. */
export function useNoteCategories() {
  return useQuery({
    queryKey: productionNoteKeys.categories,
    queryFn: () => api.get<NoteCategory[]>("/note-categories"),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new production note. */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductionNote) =>
      api.post<ProductionNote>("/notes", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionNoteKeys.byEntity(
          variables.entity_type,
          variables.entity_id,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: productionNoteKeys.pinned(
          variables.entity_type,
          variables.entity_id,
        ),
      });
    },
  });
}

/** Update an existing production note. */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateProductionNote }) =>
      api.put<ProductionNote>(`/notes/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionNoteKeys.all });
    },
  });
}

/** Delete a production note. */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionNoteKeys.all });
    },
  });
}

/** Toggle the pin state of a note. */
export function useTogglePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.patch<ProductionNote>(`/notes/${id}/pin`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionNoteKeys.all });
    },
  });
}

/** Mark a note as resolved. */
export function useResolveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.patch<ProductionNote>(`/notes/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionNoteKeys.all });
    },
  });
}

/** Clear the resolved state of a note. */
export function useUnresolveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.patch<ProductionNote>(`/notes/${id}/unresolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionNoteKeys.all });
    },
  });
}

/** Create a new note category. */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateNoteCategory) =>
      api.post<NoteCategory>("/note-categories", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionNoteKeys.categories,
      });
    },
  });
}
