/**
 * TanStack Query hooks for Platform Setup Wizard (PRD-105).
 *
 * Follows the key factory pattern used throughout the codebase.
 *
 * Backend route mounts:
 * - /admin/setup/status               -> wizard status overview
 * - /admin/setup/step/:step_name      -> step config CRUD + execute
 * - /admin/setup/test-connection      -> connectivity testing
 * - /admin/setup/skip                 -> skip wizard for experts
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  SetupStepName,
  StepStatus,
  StepValidationResult,
  TestConnectionRequest,
  WizardState,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const setupWizardKeys = {
  all: ["setup-wizard"] as const,
  status: () => [...setupWizardKeys.all, "status"] as const,
  step: (name: SetupStepName) => [...setupWizardKeys.all, "step", name] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** GET /admin/setup/status -- overall wizard status (auto-refresh 10s). */
export function useWizardStatus() {
  return useQuery({
    queryKey: setupWizardKeys.status(),
    queryFn: () => api.get<WizardState>("/admin/setup/status"),
    refetchInterval: 10_000,
  });
}

/** GET /admin/setup/step/:step_name -- config for a single step. */
export function useStepConfig(stepName: SetupStepName) {
  return useQuery({
    queryKey: setupWizardKeys.step(stepName),
    queryFn: () => api.get<StepStatus>(`/admin/setup/step/${stepName}`),
    enabled: !!stepName,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** POST /admin/setup/step/:step_name -- execute/configure a setup step. */
export function useExecuteStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      stepName,
      config,
    }: {
      stepName: SetupStepName;
      config: Record<string, unknown>;
    }) => api.post<StepStatus>(`/admin/setup/step/${stepName}`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupWizardKeys.all });
    },
  });
}

/** POST /admin/setup/test-connection -- test connectivity to a service. */
export function useTestConnection() {
  return useMutation({
    mutationFn: (data: TestConnectionRequest) =>
      api.post<StepValidationResult>("/admin/setup/test-connection", data),
  });
}

/** POST /admin/setup/skip -- skip the wizard (expert mode). */
export function useSkipWizard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<WizardState>("/admin/setup/skip"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupWizardKeys.all });
    },
  });
}

/** POST /admin/setup/step/:step_name/reset -- reset a step to unconfigured. */
export function useResetStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stepName: SetupStepName) =>
      api.post<StepStatus>(`/admin/setup/step/${stepName}/reset`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupWizardKeys.all });
    },
  });
}
