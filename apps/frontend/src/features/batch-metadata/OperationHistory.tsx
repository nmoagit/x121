/**
 * Operation history component for batch metadata operations (PRD-88).
 *
 * Lists past operations with status badges and undo buttons
 * for completed operations.
 */

import { Badge, Button } from "@/components";

import {
  useBatchMetadataOperations,
  useUndoOperation,
} from "./hooks/use-batch-metadata";
import type { BatchMetadataOperation } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_ID_LABELS: Record<number, string> = {
  1: "Preview",
  2: "Applying",
  3: "Completed",
  4: "Undone",
  5: "Failed",
};

const STATUS_ID_VARIANTS: Record<number, "default" | "warning" | "success" | "danger"> = {
  1: "default",
  2: "warning",
  3: "success",
  4: "default",
  5: "danger",
};

/** Status ID for "completed". */
const STATUS_COMPLETED = 3;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface OperationHistoryProps {
  /** Project to filter operations for. */
  projectId: number;
  /** Called when an operation is undone. */
  onUndone?: (op: BatchMetadataOperation) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OperationHistory({
  projectId,
  onUndone,
}: OperationHistoryProps) {
  const { data: operations, isLoading } = useBatchMetadataOperations({
    project_id: projectId,
    limit: 20,
  });
  const undoMutation = useUndoOperation();

  const handleUndo = (id: number) => {
    undoMutation.mutate(id, {
      onSuccess: (op) => onUndone?.(op),
    });
  };

  if (isLoading) {
    return (
      <div data-testid="operation-history-loading" className="text-sm text-[var(--color-text-secondary)]">
        Loading operation history...
      </div>
    );
  }

  if (!operations || operations.length === 0) {
    return (
      <div data-testid="operation-history-empty" className="text-sm text-[var(--color-text-secondary)]">
        No batch operations yet.
      </div>
    );
  }

  return (
    <div data-testid="operation-history" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Operation History</h3>
      {operations.map((op) => {
        const statusLabel = STATUS_ID_LABELS[op.status_id] ?? "Unknown";
        const statusVariant = STATUS_ID_VARIANTS[op.status_id] ?? "default";
        const canUndo = op.status_id === STATUS_COMPLETED;

        return (
          <div
            key={op.id}
            data-testid={`history-row-${op.id}`}
            className="flex items-center justify-between rounded border border-[var(--color-border)] p-3 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span data-testid={`history-summary-${op.id}`}>{op.summary}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {op.character_count} characters &middot;{" "}
                {new Date(op.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span data-testid={`history-status-${op.id}`}>
                <Badge variant={statusVariant} size="sm">
                  {statusLabel}
                </Badge>
              </span>
              {canUndo && (
                <Button
                  data-testid={`undo-btn-${op.id}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(op.id)}
                  disabled={undoMutation.isPending}
                >
                  Undo
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
