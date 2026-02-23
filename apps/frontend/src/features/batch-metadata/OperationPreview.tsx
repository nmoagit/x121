/**
 * Operation preview component for batch metadata operations (PRD-88).
 *
 * Shows the details of a previewed operation and allows the user
 * to confirm execution or cancel.
 */

import { Badge, Button } from "@/components";

import { useExecuteOperation } from "./hooks/use-batch-metadata";
import type { BatchMetadataOperation } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<number, string> = {
  1: "Preview",
  2: "Applying",
  3: "Completed",
  4: "Undone",
  5: "Failed",
};

const STATUS_VARIANTS: Record<number, "default" | "warning" | "success" | "danger"> = {
  1: "default",
  2: "warning",
  3: "success",
  4: "default",
  5: "danger",
};

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface OperationPreviewProps {
  /** The operation to preview. */
  operation: BatchMetadataOperation;
  /** Called when execution succeeds. */
  onExecuted?: (op: BatchMetadataOperation) => void;
  /** Called when the user cancels (dismisses the preview). */
  onCancel?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OperationPreview({
  operation,
  onExecuted,
  onCancel,
}: OperationPreviewProps) {
  const executeMutation = useExecuteOperation();

  const handleExecute = () => {
    executeMutation.mutate(operation.id, {
      onSuccess: (op) => onExecuted?.(op),
    });
  };

  const statusLabel = STATUS_LABELS[operation.status_id] ?? "Unknown";
  const statusVariant = STATUS_VARIANTS[operation.status_id] ?? "default";

  return (
    <div
      data-testid="operation-preview"
      className="rounded border border-[var(--color-border)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Operation Preview</h3>
        <span data-testid="preview-status">
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
        </span>
      </div>

      <div className="mb-3 space-y-1 text-sm">
        <div data-testid="preview-summary">{operation.summary}</div>
        <div data-testid="preview-type">
          Type: {operation.operation_type.replace(/_/g, " ")}
        </div>
        <div data-testid="preview-character-count">
          Characters affected: {operation.character_count}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          data-testid="execute-btn"
          onClick={handleExecute}
          disabled={operation.status_id !== 1 || executeMutation.isPending}
        >
          {executeMutation.isPending ? "Executing..." : "Execute"}
        </Button>
        {onCancel && (
          <Button
            data-testid="cancel-preview-btn"
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
