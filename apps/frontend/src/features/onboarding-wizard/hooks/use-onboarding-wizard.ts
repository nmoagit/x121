/**
 * Onboarding Wizard TanStack Query hooks (PRD-67).
 *
 * Provides hooks for CRUD operations on onboarding sessions,
 * step navigation, and status management.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateOnboardingSession,
  OnboardingSession,
  UpdateStepData,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const onboardingKeys = {
  all: ["onboarding-sessions"] as const,
  detail: (id: number) => ["onboarding-sessions", "detail", id] as const,
  byProject: (projectId: number) =>
    ["onboarding-sessions", "project", projectId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Get a single onboarding session by ID. */
export function useOnboardingSession(id: number) {
  return useQuery({
    queryKey: onboardingKeys.detail(id),
    queryFn: () => api.get<OnboardingSession>(`/onboarding-sessions/${id}`),
    enabled: id > 0,
  });
}

/** List onboarding sessions for a project. */
export function useOnboardingSessions(
  projectId: number,
  params?: { limit?: number; offset?: number },
) {
  const qs = new URLSearchParams({
    project_id: String(projectId),
  });
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));

  return useQuery({
    queryKey: onboardingKeys.byProject(projectId),
    queryFn: () =>
      api.get<OnboardingSession[]>(`/onboarding-sessions?${qs.toString()}`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new onboarding session. */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOnboardingSession) =>
      api.post<OnboardingSession>("/onboarding-sessions", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.byProject(variables.project_id),
      });
    },
  });
}

/** Advance the wizard to the next step. */
export function useAdvanceStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<OnboardingSession>(
        `/onboarding-sessions/${sessionId}/advance`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.detail(data.id),
      });
    },
  });
}

/** Go back one step in the wizard. */
export function useGoBack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<OnboardingSession>(
        `/onboarding-sessions/${sessionId}/go-back`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.detail(data.id),
      });
    },
  });
}

/** Update step data for the current step. */
export function useUpdateStepData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      stepData,
    }: {
      sessionId: number;
      stepData: UpdateStepData;
    }) =>
      api.put<OnboardingSession>(
        `/onboarding-sessions/${sessionId}/step-data`,
        stepData,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.detail(data.id),
      });
    },
  });
}

/** Abandon an onboarding session. */
export function useAbandonSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<OnboardingSession>(
        `/onboarding-sessions/${sessionId}/abandon`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.byProject(data.project_id),
      });
    },
  });
}

/** Complete an onboarding session. */
export function useCompleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<OnboardingSession>(
        `/onboarding-sessions/${sessionId}/complete`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.detail(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: onboardingKeys.byProject(data.project_id),
      });
    },
  });
}
