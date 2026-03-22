/**
 * Delivery TanStack Query hooks (PRD-39).
 *
 * Provides hooks for output format profiles, delivery exports,
 * pre-export validation, and watermark settings.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  AssemblyStartedResponse,
  CreateOutputFormatProfile,
  CreateWatermarkSetting,
  DeliveryExport,
  DeliveryValidationResponse,
  OutputFormatProfile,
  StartAssemblyRequest,
  UpdateOutputFormatProfile,
  UpdateWatermarkSetting,
  WatermarkSetting,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const deliveryKeys = {
  profiles: ["delivery", "profiles"] as const,
  profileDetail: (id: number) => ["delivery", "profiles", "detail", id] as const,
  exports: (projectId: number) => ["delivery", "exports", { projectId }] as const,
  exportDetail: (projectId: number, exportId: number) =>
    ["delivery", "exports", "detail", { projectId, exportId }] as const,
  validation: (projectId: number) =>
    ["delivery", "validation", { projectId }] as const,
  watermarks: ["delivery", "watermarks"] as const,
  watermarkDetail: (id: number) => ["delivery", "watermarks", "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Output Format Profile Queries
   -------------------------------------------------------------------------- */

/** Fetch all output format profiles. */
export function useOutputFormatProfiles() {
  return useQuery({
    queryKey: deliveryKeys.profiles,
    queryFn: () => api.get<OutputFormatProfile[]>("/output-format-profiles"),
  });
}

/** Fetch a single output format profile by ID. */
export function useOutputFormatProfile(id: number) {
  return useQuery({
    queryKey: deliveryKeys.profileDetail(id),
    queryFn: () => api.get<OutputFormatProfile>(`/output-format-profiles/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Output Format Profile Mutations
   -------------------------------------------------------------------------- */

/** Create a new output format profile. */
export function useCreateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOutputFormatProfile) =>
      api.post<OutputFormatProfile>("/output-format-profiles", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.profiles });
    },
  });
}

/** Update an existing output format profile. */
export function useUpdateProfile(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOutputFormatProfile) =>
      api.put<OutputFormatProfile>(`/output-format-profiles/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.profiles });
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.profileDetail(id),
      });
    },
  });
}

/** Set a profile as the platform default. */
export function useSetProfileDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profileId: number) =>
      api.put<OutputFormatProfile>(
        `/output-format-profiles/${profileId}/set-default`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.profiles });
    },
  });
}

/** Delete an output format profile. */
export function useDeleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/output-format-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.profiles });
    },
  });
}

/* --------------------------------------------------------------------------
   Assembly & Export Queries
   -------------------------------------------------------------------------- */

/** Start a new assembly/export job for a project. */
export function useStartAssembly(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartAssemblyRequest) =>
      api.post<AssemblyStartedResponse>(
        `/projects/${projectId}/assemble`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.exports(projectId),
      });
    },
  });
}

/** Cancel a pending or in-progress export. */
export function useCancelExport(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (exportId: number) =>
      api.post<DeliveryExport>(
        `/projects/${projectId}/exports/${exportId}/cancel`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.exports(projectId),
      });
    },
  });
}

/** Fetch delivery exports for a project. Polls every 5s when an export is active.
 *  Invalidates delivery status when an export completes so the status table updates. */
export function useDeliveryExports(projectId: number) {
  const queryClient = useQueryClient();
  // Track whether we had an active export on the previous poll.
  const hadActiveRef = { current: false };

  return useQuery({
    queryKey: deliveryKeys.exports(projectId),
    queryFn: async () => {
      const data = await api.get<DeliveryExport[]>(`/projects/${projectId}/exports`);
      const hasActive = data.some((e) => e.status_id >= 1 && e.status_id <= 5);

      // Export just finished — invalidate delivery status + logs so UI updates.
      if (hadActiveRef.current && !hasActive) {
        queryClient.invalidateQueries({ queryKey: ["delivery", "status"] });
        queryClient.invalidateQueries({ queryKey: ["delivery", "logs"] });
      }
      hadActiveRef.current = hasActive;

      return data;
    },
    enabled: projectId > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some((e) => e.status_id >= 1 && e.status_id <= 5);
      return hasActive ? 5000 : false;
    },
  });
}

/** Fetch a single delivery export by ID. */
export function useDeliveryExport(projectId: number, exportId: number) {
  return useQuery({
    queryKey: deliveryKeys.exportDetail(projectId, exportId),
    queryFn: () =>
      api.get<DeliveryExport>(
        `/projects/${projectId}/exports/${exportId}`,
      ),
    enabled: projectId > 0 && exportId > 0,
  });
}

/* --------------------------------------------------------------------------
   Validation Query
   -------------------------------------------------------------------------- */

/** Run pre-export validation for a project (on demand).
 *  When `avatarIds` is provided, only those models are validated. */
export function useDeliveryValidation(
  projectId: number,
  enabled = false,
  avatarIds?: number[] | null,
) {
  const idsParam = avatarIds && avatarIds.length > 0
    ? `?avatar_ids=${avatarIds.join(",")}`
    : "";
  return useQuery({
    queryKey: [...deliveryKeys.validation(projectId), avatarIds ?? "all"],
    queryFn: () =>
      api.get<DeliveryValidationResponse>(
        `/projects/${projectId}/delivery-validation${idsParam}`,
      ),
    enabled: enabled && projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Watermark Settings Queries
   -------------------------------------------------------------------------- */

/** Fetch all watermark settings. */
export function useWatermarkSettings() {
  return useQuery({
    queryKey: deliveryKeys.watermarks,
    queryFn: () => api.get<WatermarkSetting[]>("/watermark-settings"),
  });
}

/** Fetch a single watermark setting by ID. */
export function useWatermarkSetting(id: number) {
  return useQuery({
    queryKey: deliveryKeys.watermarkDetail(id),
    queryFn: () => api.get<WatermarkSetting>(`/watermark-settings/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Watermark Settings Mutations
   -------------------------------------------------------------------------- */

/** Create a new watermark setting. */
export function useCreateWatermark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWatermarkSetting) =>
      api.post<WatermarkSetting>("/watermark-settings", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.watermarks });
    },
  });
}

/** Update an existing watermark setting. */
export function useUpdateWatermark(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWatermarkSetting) =>
      api.put<WatermarkSetting>(`/watermark-settings/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.watermarks });
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.watermarkDetail(id),
      });
    },
  });
}

/** Delete a watermark setting. */
export function useDeleteWatermark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/watermark-settings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.watermarks });
    },
  });
}
