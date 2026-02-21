/**
 * Contextual hint tooltip wrapper (PRD-53).
 *
 * Wraps a UI element and shows a dismissible hint tooltip the first time
 * the user encounters it. Once dismissed, the hint is persisted server-side
 * so it never shows again.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, PLACEMENT_CLASSES } from "@/components";
import type { Placement } from "@/components";
import { cn } from "@/lib/cn";

import { hintDefinitions } from "./hintDefinitions";
import { useDismissHint, useOnboarding, useUpdateOnboarding } from "./hooks/use-onboarding";
import { DISMISS_LINK_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ContextualHintProps {
  /** Unique identifier for this hint (must match a key in hintDefinitions). */
  hintId: string;
  /** The element to wrap. */
  children: React.ReactNode;
  /** Override the default message from hintDefinitions. */
  message?: string;
  /** Override the default placement from hintDefinitions. */
  placement?: Placement;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ContextualHint({
  hintId,
  children,
  message: messageProp,
  placement: placementProp,
}: ContextualHintProps) {
  const { data, isLoading } = useOnboarding();
  const dismissMutation = useDismissHint();
  const updateMutation = useUpdateOnboarding();
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const definition = hintDefinitions[hintId];
  const displayMessage = messageProp ?? definition?.message ?? "";
  const displayPlacement = placementProp ?? definition?.placement ?? "bottom";

  const isDismissed = useMemo(() => {
    if (locallyDismissed) return true;
    if (!data) return true; // Don't show while loading.
    return (data.hints_dismissed_json ?? []).includes(hintId);
  }, [data, hintId, locallyDismissed]);

  const handleDismiss = useCallback(() => {
    setLocallyDismissed(true);
    dismissMutation.mutate(hintId);
  }, [hintId, dismissMutation]);

  const handleDismissAll = useCallback(() => {
    setLocallyDismissed(true);
    // Dismiss all known hints at once.
    const allHintIds = Object.keys(hintDefinitions);
    updateMutation.mutate({
      hints_dismissed_json: allHintIds,
    });
  }, [updateMutation]);

  // Don't render the tooltip if dismissed or still loading.
  if (isLoading || isDismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative inline-block" data-testid={`hint-wrapper-${hintId}`}>
      {children}

      {/* Hint tooltip */}
      <div
        className={cn(
          "absolute z-40 w-64 rounded-[var(--radius-md)] p-3",
          "bg-[var(--color-surface-secondary)] shadow-md",
          "border border-[var(--color-border-default)]",
          PLACEMENT_CLASSES[displayPlacement],
        )}
        data-testid={`hint-tooltip-${hintId}`}
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">{displayMessage}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={DISMISS_LINK_CLASSES}
            onClick={handleDismissAll}
            data-testid="hint-dismiss-all"
          >
            Don't show tips
          </button>
          <Button variant="ghost" size="sm" onClick={handleDismiss} data-testid="hint-got-it">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
