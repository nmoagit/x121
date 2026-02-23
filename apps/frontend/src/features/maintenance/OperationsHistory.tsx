/**
 * Operations history table for bulk data maintenance (PRD-18).
 *
 * Lists past operations with type, status, affected count, and date.
 * Shows an undo button for completed operations.
 */

import type { BulkOperation } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Status ID to human-readable label. */
const STATUS_LABELS: Record<number, string> = {
  1: "Preview",
  2: "Executing",
  3: "Completed",
  4: "Failed",
  5: "Undone",
};

/** Operation type ID to human-readable label. */
const TYPE_LABELS: Record<number, string> = {
  1: "Find & Replace",
  2: "Re-Path",
  3: "Batch Update",
};

/** Status ID for completed operations (eligible for undo). */
const STATUS_COMPLETED_ID = 3;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface OperationsHistoryProps {
  /** List of operations to display. */
  operations: BulkOperation[];
  /** Called when undo is clicked for an operation. */
  onUndo?: (id: number) => void;
  /** Called when an operation row is clicked (navigate to detail). */
  onSelect?: (id: number) => void;
  /** Whether an undo is in progress. */
  isUndoing?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OperationsHistory({
  operations,
  onUndo,
  onSelect,
  isUndoing = false,
}: OperationsHistoryProps) {
  if (operations.length === 0) {
    return (
      <div data-testid="operations-history">
        <h3 className="mb-2 text-lg font-medium text-[var(--color-text-primary)]">
          Operation History
        </h3>
        <p
          data-testid="no-operations"
          className="text-sm text-[var(--color-text-secondary)]"
        >
          No operations found.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="operations-history" className="space-y-3">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Operation History
      </h3>

      <table className="w-full text-sm" data-testid="operations-table">
        <thead>
          <tr className="border-b text-left text-[var(--color-text-secondary)]">
            <th className="pb-2 pr-4">ID</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Affected</th>
            <th className="pb-2 pr-4">Date</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr
              key={op.id}
              data-testid={`operation-row-${op.id}`}
              className="cursor-pointer border-b hover:bg-gray-50"
              onClick={() => onSelect?.(op.id)}
            >
              <td className="py-2 pr-4 font-mono text-xs">{op.id}</td>
              <td className="py-2 pr-4">
                {TYPE_LABELS[op.operation_type_id] ?? `Type ${op.operation_type_id}`}
              </td>
              <td className="py-2 pr-4">
                <span
                  data-testid={`status-badge-${op.id}`}
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    op.status_id === STATUS_COMPLETED_ID
                      ? "bg-green-100 text-green-800"
                      : op.status_id === 4
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {STATUS_LABELS[op.status_id] ?? `Status ${op.status_id}`}
                </span>
              </td>
              <td className="py-2 pr-4">{op.affected_count}</td>
              <td className="py-2 pr-4 text-xs text-[var(--color-text-secondary)]">
                {formatDate(op.created_at)}
              </td>
              <td className="py-2">
                {op.status_id === STATUS_COMPLETED_ID && (
                  <button
                    data-testid={`undo-btn-${op.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUndo?.(op.id);
                    }}
                    disabled={isUndoing}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                    type="button"
                  >
                    Undo
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
