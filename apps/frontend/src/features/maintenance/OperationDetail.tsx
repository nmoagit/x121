/**
 * Operation detail view for bulk data maintenance (PRD-18).
 *
 * Shows full details of a single bulk operation including parameters,
 * status, affected records, and execution metadata.
 */

import type { BulkOperation } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<number, string> = {
  1: "Preview",
  2: "Executing",
  3: "Completed",
  4: "Failed",
  5: "Undone",
};

const TYPE_LABELS: Record<number, string> = {
  1: "Find & Replace",
  2: "Re-Path",
  3: "Batch Update",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface OperationDetailProps {
  /** The operation to display. */
  operation: BulkOperation;
  /** Called when the back button is clicked. */
  onBack?: () => void;
  /** Called when undo is clicked. */
  onUndo?: (id: number) => void;
  /** Whether undo is in progress. */
  isUndoing?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OperationDetail({
  operation,
  onBack,
  onUndo,
  isUndoing = false,
}: OperationDetailProps) {
  const isCompleted = operation.status_id === 3;

  return (
    <div data-testid="operation-detail" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
          Operation #{operation.id}
        </h3>
        <div className="flex gap-2">
          {isCompleted && (
            <button
              data-testid="undo-btn"
              onClick={() => onUndo?.(operation.id)}
              disabled={isUndoing}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
              type="button"
            >
              {isUndoing ? "Undoing..." : "Undo"}
            </button>
          )}
          <button
            data-testid="back-btn"
            onClick={onBack}
            className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
            type="button"
          >
            Back
          </button>
        </div>
      </div>

      {/* Metadata grid */}
      <dl
        data-testid="operation-metadata"
        className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3"
      >
        <div>
          <dt className="text-[var(--color-text-secondary)]">Type</dt>
          <dd className="font-medium">
            {TYPE_LABELS[operation.operation_type_id] ??
              `Type ${operation.operation_type_id}`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Status</dt>
          <dd className="font-medium">
            {STATUS_LABELS[operation.status_id] ??
              `Status ${operation.status_id}`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Entity Type</dt>
          <dd className="font-medium">
            {operation.affected_entity_type ?? "All"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Preview Count</dt>
          <dd className="font-medium">{operation.preview_count}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Affected Count</dt>
          <dd className="font-medium">{operation.affected_count}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Created</dt>
          <dd className="font-medium">{formatDate(operation.created_at)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Executed At</dt>
          <dd className="font-medium">{formatDate(operation.executed_at)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">Undone At</dt>
          <dd className="font-medium">{formatDate(operation.undone_at)}</dd>
        </div>
      </dl>

      {/* Error message */}
      {operation.error_message && (
        <div
          data-testid="error-message"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {operation.error_message}
        </div>
      )}

      {/* Parameters */}
      <div>
        <h4 className="mb-1 text-sm font-medium text-[var(--color-text-secondary)]">
          Parameters
        </h4>
        <pre
          data-testid="operation-parameters"
          className="overflow-x-auto rounded bg-gray-50 p-3 text-xs"
        >
          {JSON.stringify(operation.parameters, null, 2)}
        </pre>
      </div>
    </div>
  );
}
