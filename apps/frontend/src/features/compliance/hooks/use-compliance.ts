/**
 * TanStack Query hooks for Video Compliance Checker (PRD-102).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ComplianceCheck,
  ComplianceRule,
  ComplianceSummary,
  CreateRuleInput,
  UpdateRuleInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const complianceKeys = {
  all: ["compliance"] as const,
  rules: () => [...complianceKeys.all, "rules"] as const,
  rulesByProject: (projectId: number) =>
    [...complianceKeys.rules(), "project", projectId] as const,
  sceneChecks: (sceneId: number) =>
    [...complianceKeys.all, "checks", sceneId] as const,
  sceneSummary: (sceneId: number) =>
    [...complianceKeys.all, "summary", sceneId] as const,
};

/* --------------------------------------------------------------------------
   Rule queries
   -------------------------------------------------------------------------- */

/** Fetches all compliance rules, optionally filtered by project. */
export function useComplianceRules(projectId?: number) {
  const path = projectId
    ? `/compliance-rules?project_id=${projectId}`
    : "/compliance-rules";

  return useQuery({
    queryKey: projectId
      ? complianceKeys.rulesByProject(projectId)
      : complianceKeys.rules(),
    queryFn: () => api.get<ComplianceRule[]>(path),
  });
}

/* --------------------------------------------------------------------------
   Scene check queries
   -------------------------------------------------------------------------- */

/** Fetches all compliance check results for a scene. */
export function useSceneChecks(sceneId: number) {
  return useQuery({
    queryKey: complianceKeys.sceneChecks(sceneId),
    queryFn: () => api.get<ComplianceCheck[]>(`/scenes/${sceneId}/compliance-checks`),
    enabled: sceneId > 0,
  });
}

/** Fetches the compliance summary for a scene. */
export function useSceneSummary(sceneId: number) {
  return useQuery({
    queryKey: complianceKeys.sceneSummary(sceneId),
    queryFn: () => api.get<ComplianceSummary>(`/scenes/${sceneId}/compliance-summary`),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Rule mutations
   -------------------------------------------------------------------------- */

/** Creates a new compliance rule. */
export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRuleInput) =>
      api.post<ComplianceRule>("/compliance-rules", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.rules() });
    },
  });
}

/** Updates an existing compliance rule. */
export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRuleInput }) =>
      api.put<ComplianceRule>(`/compliance-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.rules() });
    },
  });
}

/** Deletes a compliance rule. */
export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/compliance-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complianceKeys.rules() });
    },
  });
}

/* --------------------------------------------------------------------------
   Check mutations
   -------------------------------------------------------------------------- */

/** Runs compliance checks for a scene. */
export function useRunComplianceCheck(sceneId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<ComplianceCheck[]>(`/scenes/${sceneId}/compliance-checks/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: complianceKeys.sceneChecks(sceneId),
      });
      queryClient.invalidateQueries({
        queryKey: complianceKeys.sceneSummary(sceneId),
      });
    },
  });
}
