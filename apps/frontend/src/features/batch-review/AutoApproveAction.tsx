/**
 * Auto-approve control that approves segments above a QA threshold (PRD-92).
 *
 * Provides a threshold slider with a preview of how many segments would
 * be auto-approved, and a confirmation modal before executing.
 */

import { useCallback, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { formatPercent } from "@/lib/format";

import { useAutoApprove, useReviewProgress } from "./hooks/use-batch-review";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 1;
const THRESHOLD_STEP = 0.05;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AutoApproveActionProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AutoApproveAction({ projectId }: AutoApproveActionProps) {
  const [threshold, setThreshold] = useState(0.8);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: progress } = useReviewProgress(projectId);
  const autoApprove = useAutoApprove();

  const pendingCount = progress?.pending_segments ?? 0;
  const totalCount = progress?.total_segments ?? 0;

  const handleThresholdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!Number.isNaN(value)) {
        setThreshold(Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, value)));
      }
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    autoApprove.mutate({ project_id: projectId, threshold });
    setShowConfirm(false);
  }, [projectId, threshold, autoApprove]);

  return (
    <div data-testid="auto-approve-action" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Auto-Approve by QA Score
      </h3>

      <div className="flex items-center gap-4">
        <label
          htmlFor="auto-approve-threshold"
          className="text-sm text-[var(--color-text-secondary)]"
        >
          Threshold
        </label>
        <input
          id="auto-approve-threshold"
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={THRESHOLD_STEP}
          value={threshold}
          onChange={handleThresholdChange}
          className="flex-1"
          aria-label="Auto-approve threshold"
        />
        <Input
          type="number"
          value={String(threshold)}
          onChange={handleThresholdChange}
          step={String(THRESHOLD_STEP)}
          min={String(MIN_THRESHOLD)}
          max={String(MAX_THRESHOLD)}
          className="w-20"
          aria-label="Auto-approve threshold value"
        />
      </div>

      <p className="text-sm text-[var(--color-text-muted)]">
        {pendingCount} of {totalCount} pending segments would be evaluated at{" "}
        {formatPercent(threshold, 0)} threshold
      </p>

      {autoApprove.isSuccess && (
        <p className="text-sm text-[var(--color-action-success)]">
          {autoApprove.data.processed_count} segments auto-approved
        </p>
      )}

      <Button
        variant="primary"
        size="sm"
        onClick={() => setShowConfirm(true)}
        disabled={pendingCount === 0}
        loading={autoApprove.isPending}
      >
        Auto-Approve
      </Button>

      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Auto-Approve"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          This will approve all pending segments with a QA score at or above{" "}
          <strong>{formatPercent(threshold, 0)}</strong>. This action cannot be easily undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            loading={autoApprove.isPending}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
