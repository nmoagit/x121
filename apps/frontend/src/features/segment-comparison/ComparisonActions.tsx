/**
 * Quick action buttons for segment version comparison (PRD-101).
 *
 * Provides "Keep New", "Revert to Old", and "Keep Both" buttons with
 * keyboard shortcut hints. Calls the `useSelectVersion` mutation for
 * keep/revert decisions.
 */

import { useCallback, useEffect } from "react";

import { Button, Tooltip } from "@/components/primitives";
import { Check, Copy, RefreshCw } from "@/tokens/icons";

import { useSelectVersion } from "./hooks/use-segment-versions";
import type { ComparisonDecision } from "./types";
import { DECISION_KEEP_BOTH, DECISION_KEEP_NEW, DECISION_REVERT } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ComparisonActionsProps {
  segmentId: number;
  newVersionId: number;
  oldVersionId: number;
  onDecision: (decision: ComparisonDecision) => void;
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ComparisonActions({
  segmentId,
  newVersionId,
  oldVersionId,
  onDecision,
  disabled = false,
}: ComparisonActionsProps) {
  const selectVersion = useSelectVersion(segmentId);
  const isMutating = selectVersion.isPending;
  const isDisabled = disabled || isMutating;

  const handleKeepNew = useCallback(() => {
    selectVersion.mutate(newVersionId, {
      onSuccess: () => onDecision(DECISION_KEEP_NEW),
    });
  }, [selectVersion, newVersionId, onDecision]);

  const handleRevert = useCallback(() => {
    selectVersion.mutate(oldVersionId, {
      onSuccess: () => onDecision(DECISION_REVERT),
    });
  }, [selectVersion, oldVersionId, onDecision]);

  const handleKeepBoth = useCallback(() => {
    // "Keep Both" is a placeholder for PRD-50 branching.
    onDecision(DECISION_KEEP_BOTH);
  }, [onDecision]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isDisabled) return;
      // Ignore shortcuts when typing in inputs.
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.key.toLowerCase()) {
        case "k":
          handleKeepNew();
          break;
        case "r":
          handleRevert();
          break;
        case "b":
          handleKeepBoth();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDisabled, handleKeepNew, handleRevert, handleKeepBoth]);

  return (
    <div data-testid="comparison-actions" className="flex items-center gap-[var(--spacing-2)]">
      <Tooltip content="Keep New (K)">
        <Button
          variant="primary"
          size="sm"
          icon={<Check size={16} />}
          disabled={isDisabled}
          loading={isMutating && selectVersion.variables === newVersionId}
          onClick={handleKeepNew}
          data-testid="action-keep-new"
          className="bg-[var(--color-action-success)] hover:bg-[var(--color-action-success)]/90"
        >
          Keep New
        </Button>
      </Tooltip>

      <Tooltip content="Revert to Old (R)">
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={16} />}
          disabled={isDisabled}
          loading={isMutating && selectVersion.variables === oldVersionId}
          onClick={handleRevert}
          data-testid="action-revert"
        >
          Revert to Old
        </Button>
      </Tooltip>

      <Tooltip content="Keep Both (B)">
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy size={16} />}
          disabled={isDisabled}
          onClick={handleKeepBoth}
          data-testid="action-keep-both"
        >
          Keep Both
        </Button>
      </Tooltip>
    </div>
  );
}
