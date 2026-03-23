/**
 * TanStack Query hooks for generator script management (PRD-143).
 *
 * CRUD + execution hooks for the admin generator scripts page.
 * API prefix: /admin/generator-scripts
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface GeneratorScript {
  id: number;
  uuid: string;
  pipeline_id: number;
  name: string;
  description: string | null;
  script_type: string;
  script_content: string;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateGeneratorScript {
  pipeline_id: number;
  name: string;
  description?: string;
  script_type: string;
  script_content: string;
}

export interface UpdateGeneratorScript {
  name?: string;
  description?: string;
  script_type?: string;
  script_content?: string;
}

export interface ExecuteScriptResponse {
  output_json: unknown | null;
  stderr: string;
  duration_ms: number;
  script_version: number;
}

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const generatorScriptKeys = {
  all: ["generator-scripts"] as const,
  list: (pipelineId?: number) =>
    pipelineId
      ? [...generatorScriptKeys.all, "list", pipelineId] as const
      : [...generatorScriptKeys.all, "list"] as const,
  detail: (id: number) => [...generatorScriptKeys.all, "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** List generator scripts, optionally filtered by pipeline. */
export function useGeneratorScripts(pipelineId?: number) {
  return useQuery({
    queryKey: generatorScriptKeys.list(pipelineId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (pipelineId) params.set("pipeline_id", String(pipelineId));
      const qs = params.toString();
      return api.get<GeneratorScript[]>(`/admin/generator-scripts${qs ? `?${qs}` : ""}`);
    },
  });
}

/** Fetch a single generator script by ID. */
export function useGeneratorScript(id: number) {
  return useQuery({
    queryKey: generatorScriptKeys.detail(id),
    queryFn: () => api.get<GeneratorScript>(`/admin/generator-scripts/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new generator script. */
export function useCreateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGeneratorScript) =>
      api.post<GeneratorScript>("/admin/generator-scripts", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: generatorScriptKeys.all });
    },
  });
}

/** Update a generator script (auto-increments version on backend). */
export function useUpdateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateGeneratorScript }) =>
      api.put<GeneratorScript>(`/admin/generator-scripts/${id}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: generatorScriptKeys.all });
      qc.invalidateQueries({ queryKey: generatorScriptKeys.detail(variables.id) });
    },
  });
}

/** Soft-delete (deactivate) a generator script. */
export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/generator-scripts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: generatorScriptKeys.all });
    },
  });
}

/** Execute a script against an avatar and return the output. */
export function useExecuteScript() {
  return useMutation({
    mutationFn: ({ scriptId, avatarId }: { scriptId: number; avatarId: number }) =>
      api.post<ExecuteScriptResponse>(`/admin/generator-scripts/${scriptId}/execute`, {
        avatar_id: avatarId,
      }),
  });
}
