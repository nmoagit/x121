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

/** Fetch delivery exports for a project. */
export function useDeliveryExports(projectId: number) {
  return useQuery({
    queryKey: deliveryKeys.exports(projectId),
    queryFn: () =>
      api.get<DeliveryExport[]>(`/projects/${projectId}/exports`),
    enabled: projectId > 0,
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

/** Run pre-export validation for a project (on demand). */
export function useDeliveryValidation(projectId: number, enabled = false) {
  return useQuery({
    queryKey: deliveryKeys.validation(projectId),
    queryFn: () =>
      api.get<DeliveryValidationResponse>(
        `/projects/${projectId}/delivery-validation`,
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
