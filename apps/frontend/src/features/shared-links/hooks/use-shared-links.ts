/**
 * TanStack Query hooks for shareable preview links (PRD-84).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BulkRevokeResponse,
  CreateLinkInput,
  CreateLinkResponse,
  LinkAccessLogEntry,
  SharedLink,
  SharedLinkDetail,
  SubmitFeedbackInput,
  TokenValidationResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const sharedLinkKeys = {
  all: ["shared-links"] as const,
  list: () => [...sharedLinkKeys.all, "list"] as const,
  details: () => [...sharedLinkKeys.all, "detail"] as const,
  detail: (id: number) => [...sharedLinkKeys.details(), id] as const,
  activities: () => [...sharedLinkKeys.all, "activity"] as const,
  activity: (id: number) => [...sharedLinkKeys.activities(), id] as const,
  review: (token: string) => ["review", token] as const,
};

/* --------------------------------------------------------------------------
   Authenticated query hooks
   -------------------------------------------------------------------------- */

/** Fetch all shared links for the current user/project. */
export function useSharedLinks() {
  return useQuery({
    queryKey: sharedLinkKeys.list(),
    queryFn: () => api.get<SharedLink[]>("/shared-links"),
  });
}

/** Fetch a single shared link with access/feedback counts. */
export function useSharedLinkDetail(id: number) {
  return useQuery({
    queryKey: sharedLinkKeys.detail(id),
    queryFn: () => api.get<SharedLinkDetail>(`/shared-links/${id}`),
    enabled: id > 0,
  });
}

/** Fetch access log entries for a specific link. */
export function useLinkActivity(id: number) {
  return useQuery({
    queryKey: sharedLinkKeys.activity(id),
    queryFn: () =>
      api.get<LinkAccessLogEntry[]>(`/shared-links/${id}/activity`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Authenticated mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new shareable link. Returns the plaintext token (shown once). */
export function useCreateLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLinkInput) =>
      api.post<CreateLinkResponse>("/shared-links", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedLinkKeys.list() });
    },
  });
}

/** Revoke a single shared link. */
export function useRevokeLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete<SharedLink>(`/shared-links/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: sharedLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: sharedLinkKeys.detail(id) });
    },
  });
}

/** Bulk-revoke all active links matching a scope. */
export function useBulkRevoke() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { scope_type: string; scope_id: number }) =>
      api.post<BulkRevokeResponse>("/shared-links/bulk-revoke", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedLinkKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Public hooks (external review page — no auth required)
   -------------------------------------------------------------------------- */

/** Validate a share token. Returns scope info and whether password is needed. */
export function useValidateToken(token: string) {
  return useQuery({
    queryKey: sharedLinkKeys.review(token),
    queryFn: () =>
      api.get<TokenValidationResponse>(`/review/${token}`),
    enabled: token.length > 0,
    retry: false,
  });
}

/** Verify a password for a protected share link. */
export function useVerifyPassword(token: string) {
  return useMutation({
    mutationFn: (password: string) =>
      api.post<{ verified: boolean }>(
        `/review/${token}/verify-password`,
        { password },
      ),
  });
}

/** Submit feedback (approval/rejection + text) for a shared link. */
export function useSubmitFeedback(token: string) {
  return useMutation({
    mutationFn: (data: SubmitFeedbackInput) =>
      api.post<{ id: number }>(`/review/${token}/feedback`, data),
  });
}
