/**
 * Transition controls component (PRD-72).
 *
 * Renders buttons for each valid next lifecycle state, with confirmation
 * modals for destructive transitions (archive, close).
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { Modal } from "@/components/composite";

import { useTransitionProject } from "./hooks/use-project-lifecycle";
import {
  CONFIRM_TRANSITIONS,
  type LifecycleState,
  TRANSITION_LABELS,
  VALID_TRANSITIONS,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TransitionControlsProps {
  projectId: number;
  currentState: LifecycleState;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Get a human-readable label for a transition target. */
function getTransitionLabel(
  currentState: LifecycleState,
  targetState: LifecycleState,
): string {
  // "Re-open" when going back to active from delivered/archived
  if (targetState === "active" && currentState !== "setup") {
    return "Re-open";
  }
  return TRANSITION_LABELS[targetState];
}

/** Determine the button variant for a transition target. */
function getButtonVariant(target: LifecycleState) {
  if (CONFIRM_TRANSITIONS.includes(target)) return "danger" as const;
  return "primary" as const;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TransitionControls({
  projectId,
  currentState,
}: TransitionControlsProps) {
  const transition = useTransitionProject();
  const [confirmTarget, setConfirmTarget] = useState<LifecycleState | null>(null);

  const validTargets = VALID_TRANSITIONS[currentState];

  if (validTargets.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        This project is closed. No further transitions are available.
      </p>
    );
  }

  function handleTransition(target: LifecycleState) {
    if (CONFIRM_TRANSITIONS.includes(target)) {
      setConfirmTarget(target);
      return;
    }
    executeTransition(target);
  }

  function executeTransition(target: LifecycleState) {
    transition.mutate({ projectId, targetState: target });
    setConfirmTarget(null);
  }

  return (
    <div className="flex items-center gap-[var(--spacing-3)]" data-testid="transition-controls">
      {validTargets.map((target) => (
        <Button
          key={target}
          variant={getButtonVariant(target)}
          size="sm"
          loading={transition.isPending}
          onClick={() => handleTransition(target)}
        >
          {getTransitionLabel(currentState, target)}
        </Button>
      ))}

      {transition.isError && (
        <p className="text-sm text-[var(--color-action-danger)]">
          Transition failed. Please try again.
        </p>
      )}

      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={`Confirm: ${confirmTarget ? TRANSITION_LABELS[confirmTarget] : ""}`}
        size="sm"
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-[var(--spacing-4)]">
          {confirmTarget === "archived"
            ? "Archiving will lock the project. You can re-open it later if needed."
            : "Closing a project is a final action. The project will remain read-only."}
        </p>

        <div className="flex justify-end gap-[var(--spacing-3)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={transition.isPending}
            onClick={() => confirmTarget && executeTransition(confirmTarget)}
          >
            {confirmTarget ? TRANSITION_LABELS[confirmTarget] : ""}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
