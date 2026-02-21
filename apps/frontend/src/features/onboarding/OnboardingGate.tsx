/**
 * Onboarding gate wrapper (PRD-53).
 *
 * Checks the user's onboarding state and:
 * - If the tour has not been completed, auto-triggers the guided tour.
 * - After the tour is completed, renders the onboarding checklist alongside
 *   the wrapped children.
 */

import { useCallback, useEffect, useState } from "react";

import { OnboardingChecklist } from "./OnboardingChecklist";
import { TourEngine } from "./TourEngine";
import { useOnboarding, useUpdateOnboarding } from "./hooks/use-onboarding";
import { tourPaths } from "./tourPaths";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface OnboardingGateProps {
  /** The user's role, used to select the appropriate tour path. */
  role?: string;
  /** The wrapped dashboard/page content. */
  children: React.ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OnboardingGate({ role = "creator", children }: OnboardingGateProps) {
  const { data, isLoading } = useOnboarding();
  const updateMutation = useUpdateOnboarding();
  const [showTour, setShowTour] = useState(false);

  // Auto-trigger tour on first visit when tour_completed is false.
  useEffect(() => {
    if (!isLoading && data && !data.tour_completed) {
      setShowTour(true);
    }
  }, [isLoading, data]);

  const handleTourEnd = useCallback(() => {
    setShowTour(false);
    updateMutation.mutate({ tour_completed: true });
  }, [updateMutation]);

  if (isLoading) {
    return <>{children}</>;
  }

  const steps = tourPaths[role] ?? tourPaths["creator"] ?? [];

  return (
    <>
      {showTour && <TourEngine steps={steps} onComplete={handleTourEnd} onSkip={handleTourEnd} />}

      {/* Show checklist on dashboard after tour is done. */}
      {data && data.tour_completed && <OnboardingChecklist />}

      {children}
    </>
  );
}
