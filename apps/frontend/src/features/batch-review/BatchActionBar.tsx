/**
 * Toolbar for batch actions on selected segments (PRD-92).
 *
 * Appears when one or more segments are selected. Provides bulk approve,
 * reject (with optional reason), and clear selection controls.
 */

import { useCallback, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Check, XCircle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useBatchApprove, useBatchReject } from "./hooks/use-batch-review";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BatchActionBarProps {
  selectedIds: number[];
  onClear: () => void;
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BatchActionBar({ selectedIds, onClear, projectId: _projectId }: BatchActionBarProps) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const batchApprove = useBatchApprove();
  const batchReject = useBatchReject();

  const hasSelection = selectedIds.length > 0;
  const isBusy = batchApprove.isPending || batchReject.isPending;

  const handleApproveAll = useCallback(() => {
    if (!hasSelection) return;
    batchApprove.mutate({ segment_ids: selectedIds });
  }, [hasSelection, selectedIds, batchApprove]);

  const handleRejectAll = useCallback(() => {
    if (!hasSelection) return;
    batchReject.mutate({
      segment_ids: selectedIds,
      reason: rejectReason.trim() || undefined,
    });
    setShowRejectInput(false);
    setRejectReason("");
  }, [hasSelection, selectedIds, rejectReason, batchReject]);

  const handleCancelReject = useCallback(() => {
    setShowRejectInput(false);
    setRejectReason("");
  }, []);

  return (
    <div
      data-testid="batch-action-bar"
      className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] px-4 py-3"
    >
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {selectedIds.length} segment{selectedIds.length !== 1 ? "s" : ""} selected
      </span>

      <div className="ml-auto flex items-center gap-2">
        {/* Success feedback */}
        {batchApprove.isSuccess && (
          <span className="text-sm text-[var(--color-action-success)]">
            {batchApprove.data.processed_count} approved
          </span>
        )}
        {batchReject.isSuccess && (
          <span className="text-sm text-[var(--color-action-danger)]">
            {batchReject.data.processed_count} rejected
          </span>
        )}

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-56"
              aria-label="Rejection reason"
            />
            <Button
              variant="danger"
              size="sm"
              loading={batchReject.isPending}
              onClick={handleRejectAll}
              disabled={!hasSelection}
            >
              Confirm Reject
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelReject}
            >
              Cancel
            </Button>
          </div>
        )}

        {!showRejectInput && (
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<Check size={iconSizes.sm} />}
              loading={batchApprove.isPending}
              onClick={handleApproveAll}
              disabled={!hasSelection || isBusy}
            >
              Approve All
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle size={iconSizes.sm} />}
              onClick={() => setShowRejectInput(true)}
              disabled={!hasSelection || isBusy}
            >
              Reject All
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={!hasSelection}
        >
          Clear Selection
        </Button>
      </div>
    </div>
  );
}
