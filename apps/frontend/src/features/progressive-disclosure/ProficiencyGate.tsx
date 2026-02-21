import type { ReactNode } from "react";
import {
  useProficiencyTracker,
  type ProficiencyLevel,
} from "./useProficiencyTracker";

/** Ordered proficiency levels for comparison. */
const LEVEL_ORDER: Record<ProficiencyLevel, number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

interface ProficiencyGateProps {
  /** Minimum proficiency level required to see the children. */
  minLevel: ProficiencyLevel;
  /** Feature area key used to look up the user's proficiency. */
  featureArea: string;
  /** Content shown when the user meets the proficiency threshold. */
  children: ReactNode;
  /** Optional fallback shown when the user does not meet the threshold. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the user's proficiency level (PRD-32).
 *
 * Shows `children` only when the user's proficiency for `featureArea` is at
 * or above `minLevel`. Shows `fallback` (or nothing) otherwise.
 *
 * Intentionally does NOT display any "beginner" label or proficiency indicator
 * to avoid making users feel judged.
 */
export function ProficiencyGate({
  minLevel,
  featureArea,
  children,
  fallback = null,
}: ProficiencyGateProps) {
  const { proficiency, isLoading } = useProficiencyTracker(featureArea);

  // While loading, hide gated content to prevent flash of content that
  // should be hidden.
  if (isLoading) {
    return <>{fallback}</>;
  }

  const meetsThreshold = LEVEL_ORDER[proficiency] >= LEVEL_ORDER[minLevel];

  if (!meetsThreshold) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
