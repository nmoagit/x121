/**
 * TanStack Query hooks for Dashboard Widget Customization (PRD-89).
 *
 * Follows the key factory pattern used throughout the codebase.
 *
 * Backend route mounts:
 * - /user/dashboard              -> user dashboard CRUD
 * - /user/dashboard/presets      -> preset management
 * - /dashboard/widget-catalogue    -> available widgets
 * - /admin/dashboard/role-defaults -> admin role defaults
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateDashboardPreset,
  DashboardLayout,
  DashboardPreset,
  DashboardRoleDefault,
  SaveDashboardPayload,
  SharePresetResponse,
  UpdateDashboardPreset,
  WidgetDefinition,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const dashboardKeys = {
  all: ["dashboard"] as const,
  layout: () => [...dashboardKeys.all, "layout"] as const,
  presets: () => [...dashboardKeys.all, "presets"] as const,
  preset: (id: number) => [...dashboardKeys.all, "preset", id] as const,
  widgetCatalogue: () => [...dashboardKeys.all, "widget-catalogue"] as const,
  roleDefaults: () => [...dashboardKeys.all, "role-defaults"] as const,
  roleDefault: (role: string) =>
    [...dashboardKeys.all, "role-default", role] as const,
};

/* --------------------------------------------------------------------------
   User: Dashboard layout
   -------------------------------------------------------------------------- */

/** GET /user/dashboard/effective -- resolved layout for the current user. */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.layout(),
    queryFn: () => api.get<DashboardLayout>("/user/dashboard/effective"),
  });
}

/** PUT /user/dashboard/layout -- save the current user's dashboard layout. */
export function useSaveDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SaveDashboardPayload) =>
      api.put<DashboardPreset>("/user/dashboard/layout", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.layout() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/* --------------------------------------------------------------------------
   User: Presets
   -------------------------------------------------------------------------- */

/** GET /user/dashboard/presets -- list all presets for the current user. */
export function usePresets() {
  return useQuery({
    queryKey: dashboardKeys.presets(),
    queryFn: () => api.get<DashboardPreset[]>("/user/dashboard/presets"),
  });
}

/** POST /user/dashboard/presets -- create a new preset. */
export function useCreatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDashboardPreset) =>
      api.post<DashboardPreset>("/user/dashboard/presets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/** PUT /user/dashboard/presets/:id -- update an existing preset. */
export function useUpdatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDashboardPreset }) =>
      api.put<DashboardPreset>(`/user/dashboard/presets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/** DELETE /user/dashboard/presets/:id -- delete a preset. */
export function useDeletePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/user/dashboard/presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/** POST /user/dashboard/presets/:id/activate -- activate a preset. */
export function useActivatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<DashboardPreset>(`/user/dashboard/presets/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/** POST /user/dashboard/presets/:id/share -- generate a share token. */
export function useSharePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<SharePresetResponse>(`/user/dashboard/presets/${id}/share`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/** POST /user/dashboard/presets/import/:share_token -- import a shared preset. */
export function useImportPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareToken: string) =>
      api.post<DashboardPreset>(
        `/user/dashboard/presets/import/${shareToken}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.presets() });
    },
  });
}

/* --------------------------------------------------------------------------
   Widget catalogue
   -------------------------------------------------------------------------- */

/** GET /dashboard/widget-catalogue -- list all available widgets. */
export function useWidgetCatalogue() {
  return useQuery({
    queryKey: dashboardKeys.widgetCatalogue(),
    queryFn: () => api.get<WidgetDefinition[]>("/dashboard/widget-catalogue"),
    staleTime: 5 * 60 * 1000, // 5 minutes — catalogue changes rarely
  });
}

/* --------------------------------------------------------------------------
   Admin: Role defaults
   -------------------------------------------------------------------------- */

/** GET /admin/dashboard/role-defaults -- list all role default layouts. */
export function useRoleDefaults() {
  return useQuery({
    queryKey: dashboardKeys.roleDefaults(),
    queryFn: () =>
      api.get<DashboardRoleDefault[]>("/admin/dashboard/role-defaults"),
  });
}

/** PUT /admin/dashboard/role-defaults/:role -- update a role default layout. */
export function useUpdateRoleDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      role,
      data,
    }: {
      role: string;
      data: { layout_json: unknown[]; widget_settings_json: Record<string, Record<string, unknown>> };
    }) =>
      api.put<DashboardRoleDefault>(
        `/admin/dashboard/role-defaults/${role}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.roleDefaults() });
    },
  });
}
