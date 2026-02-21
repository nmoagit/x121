/**
 * TanStack Query hooks for the extension system (PRD-85).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Extension } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const extensionKeys = {
  all: ["extensions"] as const,
  lists: () => [...extensionKeys.all, "list"] as const,
  list: () => [...extensionKeys.lists()] as const,
  details: () => [...extensionKeys.all, "detail"] as const,
  detail: (id: number) => [...extensionKeys.details(), id] as const,
  registry: () => [...extensionKeys.all, "registry"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all installed extensions (admin). */
export function useExtensions() {
  return useQuery({
    queryKey: extensionKeys.list(),
    queryFn: () => api.get<Extension[]>("/admin/extensions"),
  });
}

/** Fetch a single extension by id (admin). */
export function useExtension(id: number | null) {
  return useQuery({
    queryKey: extensionKeys.detail(id ?? 0),
    queryFn: () => api.get<Extension>(`/admin/extensions/${id}`),
    enabled: id !== null,
  });
}

/** Fetch enabled extensions registry (non-admin, for rendering). */
export function useExtensionRegistry() {
  return useQuery({
    queryKey: extensionKeys.registry(),
    queryFn: () => api.get<Extension[]>("/extensions/registry"),
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

interface InstallExtensionInput {
  manifest_json: Record<string, unknown>;
  source_path: string;
  settings_json?: Record<string, unknown>;
}

/** Install a new extension. */
export function useInstallExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InstallExtensionInput) =>
      api.post<Extension>("/admin/extensions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
    },
  });
}

interface UpdateExtensionSettingsInput {
  settings_json: Record<string, unknown>;
}

/** Update extension settings. */
export function useUpdateExtensionSettings(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateExtensionSettingsInput) =>
      api.put<Extension>(`/admin/extensions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: extensionKeys.list() });
    },
  });
}

/** Uninstall an extension. */
export function useUninstallExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/extensions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
    },
  });
}

/** Enable an extension. */
export function useEnableExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<Extension>(`/admin/extensions/${id}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
    },
  });
}

/** Disable an extension. */
export function useDisableExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<Extension>(`/admin/extensions/${id}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extensionKeys.all });
    },
  });
}
