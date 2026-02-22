/**
 * TanStack Query hooks for collaborative review notes (PRD-38).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateReviewNote,
  CreateReviewTag,
  ReviewNote,
  ReviewNoteTag,
  ReviewTag,
  UpdateReviewNote,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const reviewNoteKeys = {
  all: ["review-notes"] as const,
  notes: (segmentId: number) =>
    [...reviewNoteKeys.all, "notes", segmentId] as const,
  tags: () => [...reviewNoteKeys.all, "tags"] as const,
  noteTags: (noteId: number) =>
    [...reviewNoteKeys.all, "note-tags", noteId] as const,
};

/* --------------------------------------------------------------------------
   Note queries
   -------------------------------------------------------------------------- */

/** Fetches all review notes for a segment. */
export function useReviewNotes(segmentId: number) {
  return useQuery({
    queryKey: reviewNoteKeys.notes(segmentId),
    queryFn: () =>
      api.get<ReviewNote[]>(`/segments/${segmentId}/notes`),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Tag queries
   -------------------------------------------------------------------------- */

/** Fetches all review tags. */
export function useReviewTags() {
  return useQuery({
    queryKey: reviewNoteKeys.tags(),
    queryFn: () => api.get<ReviewTag[]>("/review-tags"),
  });
}

/* --------------------------------------------------------------------------
   Note mutations
   -------------------------------------------------------------------------- */

/** Create a new review note on a segment. */
export function useCreateNote(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateReviewNote, "segment_id">) =>
      api.post<ReviewNote>(`/segments/${segmentId}/notes`, {
        ...input,
        segment_id: segmentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.notes(segmentId),
      });
    },
  });
}

/** Update a review note's text or status. */
export function useUpdateNote(segmentId: number, noteId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateReviewNote) =>
      api.put<ReviewNote>(`/segments/${segmentId}/notes/${noteId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.notes(segmentId),
      });
    },
  });
}

/** Delete a review note. */
export function useDeleteNote(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: number) =>
      api.delete(`/segments/${segmentId}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.notes(segmentId),
      });
    },
  });
}

/** Mark a review note as resolved. */
export function useResolveNote(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: number) =>
      api.put<ReviewNote>(
        `/segments/${segmentId}/notes/${noteId}/resolve`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.notes(segmentId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Tag mutations
   -------------------------------------------------------------------------- */

/** Create a new custom review tag. */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReviewTag) =>
      api.post<ReviewTag>("/review-tags", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.tags(),
      });
    },
  });
}

/** Assign tags to a review note. */
export function useAssignTags(segmentId: number, noteId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagIds: number[]) =>
      api.post<ReviewNoteTag[]>(
        `/segments/${segmentId}/notes/${noteId}/tags`,
        { tag_ids: tagIds },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.notes(segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: reviewNoteKeys.noteTags(noteId),
      });
    },
  });
}
