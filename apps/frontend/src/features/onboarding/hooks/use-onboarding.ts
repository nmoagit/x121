/**
 * Onboarding TanStack Query hooks (PRD-53).
 *
 * Provides hooks for fetching, updating, and resetting onboarding state,
 * plus convenience mutations for dismissing hints and completing checklist
 * items.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { UpdateOnboarding, UserOnboarding } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const onboardingKeys = {
  all: ["onboarding"] as const,
  state: () => [...onboardingKeys.all, "state"] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the current user's onboarding state (get-or-create). */
export function useOnboarding() {
  return useQuery({
    queryKey: onboardingKeys.state(),
    queryFn: () => api.get<UserOnboarding>("/user/onboarding"),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Partially update onboarding state. */
export function useUpdateOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOnboarding) =>
      api.put<UserOnboarding>("/user/onboarding", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() });
    },
  });
}

/** Reset all onboarding progress to defaults. */
export function useResetOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<UserOnboarding>("/user/onboarding/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() });
    },
  });
}

/**
 * Convenience mutation: dismiss a single hint by appending its ID to
 * the dismissed array.
 */
export function useDismissHint() {
  const updateMutation = useUpdateOnboarding();

  return useMutation({
    mutationFn: (hintId: string) =>
      updateMutation.mutateAsync({
        hints_dismissed_json: [hintId],
      }),
  });
}

/**
 * Convenience mutation: mark a single checklist item as complete.
 */
export function useCompleteChecklistItem() {
  const updateMutation = useUpdateOnboarding();

  return useMutation({
    mutationFn: (itemId: string) =>
      updateMutation.mutateAsync({
        checklist_progress_json: { [itemId]: true },
      }),
  });
}
