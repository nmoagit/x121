/**
 * TanStack Query hooks for metadata template administration (PRD-113).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MetadataTemplateField } from "@/features/characters/types";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types (mirrors backend models)
   -------------------------------------------------------------------------- */

export type { MetadataTemplateField };

export interface MetadataTemplate {
  id: number;
  name: string;
  description: string | null;
  project_id: number | null;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateWithFields extends MetadataTemplate {
  fields: MetadataTemplateField[];
}

interface CreateTemplateInput {
  name: string;
  description?: string;
  project_id?: number;
  is_default?: boolean;
}

interface UpdateTemplateInput {
  name?: string;
  description?: string;
  is_default?: boolean;
}

interface CreateFieldInput {
  field_name: string;
  field_type: string;
  is_required?: boolean;
  constraints?: Record<string, unknown>;
  description?: string;
  sort_order?: number;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const templateKeys = {
  all: ["metadata-templates"] as const,
  detail: (id: number) => ["metadata-templates", id] as const,
};

/* --------------------------------------------------------------------------
   Template hooks
   -------------------------------------------------------------------------- */

/** List all metadata templates. */
export function useMetadataTemplates() {
  return useQuery({
    queryKey: templateKeys.all,
    queryFn: () => api.get<MetadataTemplate[]>("/metadata-templates"),
  });
}

/** Fetch a single template with its fields. */
export function useMetadataTemplate(id: number) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => api.get<TemplateWithFields>(`/metadata-templates/${id}`),
    enabled: id > 0,
  });
}

/** Create a new template. */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      api.post<MetadataTemplate>("/metadata-templates", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

/** Update a template. */
export function useUpdateTemplate(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTemplateInput) =>
      api.put<MetadataTemplate>(`/metadata-templates/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
}

/** Delete a template. */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/metadata-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Field hooks
   -------------------------------------------------------------------------- */

/** Add a field to a template. */
export function useCreateTemplateField(templateId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFieldInput) =>
      api.post<MetadataTemplateField>(`/metadata-templates/${templateId}/fields`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(templateId),
      });
    },
  });
}

/** Delete a field from a template. */
export function useDeleteTemplateField(templateId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: number) =>
      api.delete(`/metadata-templates/${templateId}/fields/${fieldId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(templateId),
      });
    },
  });
}
