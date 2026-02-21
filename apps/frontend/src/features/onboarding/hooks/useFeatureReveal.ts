/**
 * Feature reveal hook (PRD-53).
 *
 * Checks whether a feature has been revealed to the user and provides
 * a function to reveal it.
 */

import { useCallback, useMemo } from "react";

import { useOnboarding, useUpdateOnboarding } from "./use-onboarding";

interface FeatureRevealState {
  /** Whether the feature has been revealed to the user. */
  isRevealed: boolean;
  /** Mark the feature as revealed. */
  reveal: () => void;
  /** Whether the onboarding data is still loading. */
  isLoading: boolean;
}

/**
 * Hook to check and control whether a specific feature has been revealed
 * to the current user.
 */
export function useFeatureReveal(featureKey: string): FeatureRevealState {
  const { data, isLoading } = useOnboarding();
  const updateMutation = useUpdateOnboarding();

  const isRevealed = useMemo(() => {
    if (!data) return false;
    return data.feature_reveal_json[featureKey] === true;
  }, [data, featureKey]);

  const reveal = useCallback(() => {
    updateMutation.mutate({
      feature_reveal_json: { [featureKey]: true },
    });
  }, [featureKey, updateMutation]);

  return { isRevealed, reveal, isLoading };
}
