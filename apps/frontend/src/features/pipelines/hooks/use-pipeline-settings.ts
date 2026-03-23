/**
 * TanStack Query hooks for pipeline settings sub-resources (PRD-143).
 *
 * Covers metadata template, speech config, and generator script endpoints
 * nested under `/pipelines/{id}/...`.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { pipelineKeys } from "./use-pipelines";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface PipelineMetadataTemplate {
  id: number;
  name: string;
  description: string | null;
  project_id: number | null;
  pipeline_id: number | null;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineSpeechConfigEntry {
  speech_type_id: number;
  language_id: number;
  min_variants: number;
}

export interface PipelineSpeechConfig {
  id: number;
  pipeline_id: number;
  speech_type_id: number;
  language_id: number;
  min_variants: number;
  created_at: string;
}

export interface PipelineGeneratorScript {
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

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const pipelineSettingsKeys = {
  metadataTemplate: (pipelineId: number) =>
    [...pipelineKeys.detail(pipelineId), "metadata-template"] as const,
  speechConfig: (pipelineId: number) =>
    [...pipelineKeys.detail(pipelineId), "speech-config"] as const,
  generatorScripts: (pipelineId: number) =>
    [...pipelineKeys.detail(pipelineId), "generator-scripts"] as const,
};

/* --------------------------------------------------------------------------
   Metadata template hooks
   -------------------------------------------------------------------------- */

/** Fetch the pipeline's default metadata template (or null). */
export function usePipelineMetadataTemplate(pipelineId: number) {
  return useQuery({
    queryKey: pipelineSettingsKeys.metadataTemplate(pipelineId),
    queryFn: () =>
      api.get<PipelineMetadataTemplate | null>(
        `/pipelines/${pipelineId}/metadata-template`,
      ),
    enabled: pipelineId > 0,
  });
}

/** Assign a metadata template as the pipeline's default. */
export function useSetPipelineMetadataTemplate(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) =>
      api.put<PipelineMetadataTemplate>(
        `/pipelines/${pipelineId}/metadata-template`,
        { template_id: templateId },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: pipelineSettingsKeys.metadataTemplate(pipelineId),
      }),
  });
}

/* --------------------------------------------------------------------------
   Speech config hooks
   -------------------------------------------------------------------------- */

/** Fetch pipeline speech config entries. */
export function usePipelineSpeechConfig(pipelineId: number) {
  return useQuery({
    queryKey: pipelineSettingsKeys.speechConfig(pipelineId),
    queryFn: () =>
      api.get<PipelineSpeechConfig[]>(
        `/pipelines/${pipelineId}/speech-config`,
      ),
    enabled: pipelineId > 0,
  });
}

/** Bulk upsert pipeline speech config entries. */
export function useSetPipelineSpeechConfig(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: PipelineSpeechConfigEntry[]) =>
      api.put<PipelineSpeechConfig[]>(
        `/pipelines/${pipelineId}/speech-config`,
        { entries },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: pipelineSettingsKeys.speechConfig(pipelineId),
      }),
  });
}

/* --------------------------------------------------------------------------
   Generator script hooks (pipeline-scoped list for settings cards)
   -------------------------------------------------------------------------- */

/** List generator scripts for a pipeline (for the settings card summary). */
export function usePipelineGeneratorScripts(pipelineId: number) {
  return useQuery({
    queryKey: pipelineSettingsKeys.generatorScripts(pipelineId),
    queryFn: () =>
      api.get<PipelineGeneratorScript[]>(
        `/admin/generator-scripts?pipeline_id=${pipelineId}`,
      ),
    enabled: pipelineId > 0,
  });
}
