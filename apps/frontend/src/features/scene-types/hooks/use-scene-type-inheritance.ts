/**
 * TanStack Query hooks for scene type inheritance & composition (PRD-100).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ApplyMixin,
  CreateMixin,
  CreateSceneType,
  EffectiveConfig,
  Mixin,
  SceneType,
  SceneTypeOverride,
  UpdateMixin,
  UpsertOverride,
} from "../types";
import { sceneTypeKeys } from "./use-scene-types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const inheritanceKeys = {
  all: ["scene-type-inheritance"] as const,
  children: (parentId: number) => [...inheritanceKeys.all, "children", parentId] as const,
  effectiveConfig: (id: number) => [...inheritanceKeys.all, "effective-config", id] as const,
  overrides: (id: number) => [...inheritanceKeys.all, "overrides", id] as const,
  cascadePreview: (id: number, field: string) =>
    [...inheritanceKeys.all, "cascade-preview", id, field] as const,
  appliedMixins: (id: number) => [...inheritanceKeys.all, "mixins", id] as const,
};

export const mixinKeys = {
  all: ["mixins"] as const,
  lists: () => [...mixinKeys.all, "list"] as const,
  details: () => [...mixinKeys.all, "detail"] as const,
  detail: (id: number) => [...mixinKeys.all, "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch children of a scene type. */
export function useChildren(parentId: number) {
  return useQuery({
    queryKey: inheritanceKeys.children(parentId),
    queryFn: () => api.get<SceneType[]>(`/scene-types/${parentId}/children`),
    enabled: parentId > 0,
  });
}

/** Fetch the fully resolved (effective) config for a scene type. */
export function useEffectiveConfig(id: number) {
  return useQuery({
    queryKey: inheritanceKeys.effectiveConfig(id),
    queryFn: () => api.get<EffectiveConfig>(`/scene-types/${id}/effective-config`),
    enabled: id > 0,
  });
}

/** Fetch field overrides for a scene type. */
export function useOverrides(id: number) {
  return useQuery({
    queryKey: inheritanceKeys.overrides(id),
    queryFn: () => api.get<SceneTypeOverride[]>(`/scene-types/${id}/overrides`),
    enabled: id > 0,
  });
}

/** Preview cascade impact of changing a field. */
export function useCascadePreview(id: number, field: string) {
  return useQuery({
    queryKey: inheritanceKeys.cascadePreview(id, field),
    queryFn: () => api.get<SceneType[]>(`/scene-types/${id}/cascade-preview/${field}`),
    enabled: id > 0 && field.length > 0,
  });
}

/** Fetch mixins applied to a scene type. */
export function useAppliedMixins(id: number) {
  return useQuery({
    queryKey: inheritanceKeys.appliedMixins(id),
    queryFn: () => api.get<Mixin[]>(`/scene-types/${id}/mixins`),
    enabled: id > 0,
  });
}

/** Fetch all available mixins. */
export function useMixins() {
  return useQuery({
    queryKey: mixinKeys.lists(),
    queryFn: () => api.get<Mixin[]>("/mixins"),
  });
}

/** Fetch a single mixin by id. */
export function useMixin(id: number) {
  return useQuery({
    queryKey: mixinKeys.detail(id),
    queryFn: () => api.get<Mixin>(`/mixins/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a child scene type under a parent. */
export function useCreateChild(parentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneType) =>
      api.post<SceneType>(`/scene-types/${parentId}/children`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.children(parentId),
      });
      queryClient.invalidateQueries({ queryKey: sceneTypeKeys.all });
    },
  });
}

/** Upsert a field override on a scene type. */
export function useUpsertOverride(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertOverride) =>
      api.put<SceneTypeOverride>(`/scene-types/${sceneTypeId}/overrides`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.overrides(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.effectiveConfig(sceneTypeId),
      });
    },
  });
}

/** Delete a field override from a scene type. */
export function useDeleteOverride(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (field: string) => api.delete(`/scene-types/${sceneTypeId}/overrides/${field}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.overrides(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.effectiveConfig(sceneTypeId),
      });
    },
  });
}

/** Create a new mixin. */
export function useCreateMixin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMixin) => api.post<Mixin>("/mixins", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mixinKeys.all });
    },
  });
}

/** Update an existing mixin. */
export function useUpdateMixin(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateMixin) => api.put<Mixin>(`/mixins/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mixinKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: mixinKeys.lists() });
    },
  });
}

/** Delete a mixin. */
export function useDeleteMixin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/mixins/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mixinKeys.all });
    },
  });
}

/** Apply a mixin to a scene type. */
export function useApplyMixin(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ApplyMixin) => api.post(`/scene-types/${sceneTypeId}/mixins`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.appliedMixins(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.effectiveConfig(sceneTypeId),
      });
    },
  });
}

/** Remove a mixin from a scene type. */
export function useRemoveMixin(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mixinId: number) => api.delete(`/scene-types/${sceneTypeId}/mixins/${mixinId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.appliedMixins(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: inheritanceKeys.effectiveConfig(sceneTypeId),
      });
    },
  });
}
