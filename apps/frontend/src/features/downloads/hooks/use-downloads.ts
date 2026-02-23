/**
 * TanStack Query hooks for the Model & LoRA Download Manager (PRD-104).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ApiTokenInfo,
  CreateDownloadRequest,
  CreatePlacementRule,
  DownloadCreatedResponse,
  ModelDownload,
  PlacementRule,
  StoreTokenRequest,
  UpdatePlacementRule,
} from "../types";
import { DOWNLOAD_STATUS } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const downloadKeys = {
  all: ["downloads"] as const,
  list: () => [...downloadKeys.all, "list"] as const,
  detail: (id: number) => [...downloadKeys.all, "detail", id] as const,
  placementRules: () => ["placement-rules"] as const,
  apiTokens: () => ["api-tokens"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Polling interval for active downloads: 3 seconds. */
const ACTIVE_POLL_MS = 3_000;

/** Status IDs that indicate an active (in-progress) download. */
const ACTIVE_STATUSES = new Set<number>([
  DOWNLOAD_STATUS.QUEUED,
  DOWNLOAD_STATUS.DOWNLOADING,
  DOWNLOAD_STATUS.VERIFYING,
  DOWNLOAD_STATUS.REGISTERING,
]);

/* --------------------------------------------------------------------------
   Download hooks
   -------------------------------------------------------------------------- */

/** Fetch all downloads. Polls every 3s if any download is active. */
export function useDownloads() {
  return useQuery({
    queryKey: downloadKeys.list(),
    queryFn: () => api.get<ModelDownload[]>("/downloads"),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        Array.isArray(data) &&
        data.some((d) => ACTIVE_STATUSES.has(d.status_id))
      ) {
        return ACTIVE_POLL_MS;
      }
      return false;
    },
  });
}

/** Fetch a single download by ID. */
export function useDownload(id: number) {
  return useQuery({
    queryKey: downloadKeys.detail(id),
    queryFn: () => api.get<ModelDownload>(`/downloads/${id}`),
    enabled: id > 0,
  });
}

/** Enqueue a new download. */
export function useCreateDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDownloadRequest) =>
      api.post<DownloadCreatedResponse>("/downloads", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });
}

/** Pause an active download. */
export function usePauseDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ModelDownload>(`/downloads/${id}/pause`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });
}

/** Resume a paused download. */
export function useResumeDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ModelDownload>(`/downloads/${id}/resume`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });
}

/** Cancel an active or queued download. */
export function useCancelDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ModelDownload>(`/downloads/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });
}

/** Retry a failed or cancelled download. */
export function useRetryDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ModelDownload>(`/downloads/${id}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });
}

/* --------------------------------------------------------------------------
   Placement rule hooks
   -------------------------------------------------------------------------- */

/** Fetch all placement rules. */
export function usePlacementRules() {
  return useQuery({
    queryKey: downloadKeys.placementRules(),
    queryFn: () => api.get<PlacementRule[]>("/admin/placement-rules"),
  });
}

/** Create a new placement rule. */
export function useCreatePlacementRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlacementRule) =>
      api.post<PlacementRule>("/admin/placement-rules", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.placementRules() });
    },
  });
}

/** Update an existing placement rule. */
export function useUpdatePlacementRule(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePlacementRule) =>
      api.put<PlacementRule>(`/admin/placement-rules/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.placementRules() });
    },
  });
}

/** Delete a placement rule. */
export function useDeletePlacementRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/placement-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.placementRules() });
    },
  });
}

/* --------------------------------------------------------------------------
   API token hooks
   -------------------------------------------------------------------------- */

/** Fetch all stored API tokens for the current user. */
export function useApiTokens() {
  return useQuery({
    queryKey: downloadKeys.apiTokens(),
    queryFn: () => api.get<ApiTokenInfo[]>("/user/api-tokens"),
  });
}

/** Store (or update) an API token. */
export function useStoreToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StoreTokenRequest) =>
      api.post<ApiTokenInfo>("/user/api-tokens", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.apiTokens() });
    },
  });
}

/** Delete an API token for a service. */
export function useDeleteToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (service: string) =>
      api.delete(`/user/api-tokens/${service}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: downloadKeys.apiTokens() });
    },
  });
}
