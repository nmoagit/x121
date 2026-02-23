/**
 * Failure heatmap component (PRD-64).
 *
 * Renders a matrix grid with rows and columns representing different
 * parameter dimensions. Cells are color-coded by failure severity.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";

import { useFailureHeatmap } from "./hooks/use-failure-analytics";
import type { HeatmapCell } from "./types";
import { HEATMAP_DIMENSIONS, severityBadgeVariant } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FailureHeatmapProps {
  /** Called when a cell is clicked to show pattern details. */
  onCellClick?: (cell: HeatmapCell) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FailureHeatmap({ onCellClick }: FailureHeatmapProps) {
  const [rowDimension, setRowDimension] = useState("workflow");
  const [colDimension, setColDimension] = useState("character");

  const { data, isPending, isError } = useFailureHeatmap(
    rowDimension,
    colDimension,
  );

  return (
    <div className="space-y-4">
      {/* Dimension selectors */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          Rows:
          <select
            value={rowDimension}
            onChange={(e) => setRowDimension(e.target.value)}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
            data-testid="row-dimension-select"
          >
            {HEATMAP_DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          Columns:
          <select
            value={colDimension}
            onChange={(e) => setColDimension(e.target.value)}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
            data-testid="col-dimension-select"
          >
            {HEATMAP_DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Loading/error states */}
      {isPending && (
        <p className="text-sm text-[var(--color-text-muted)]">
          Loading heatmap...
        </p>
      )}
      {isError && (
        <p className="text-sm text-[var(--color-action-danger)]">
          Failed to load heatmap data.
        </p>
      )}

      {/* Heatmap grid */}
      {data && data.cells.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left text-[var(--color-text-muted)]" />
                {data.col_labels.map((col) => (
                  <th
                    key={col}
                    className="p-2 text-center text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.row_labels.map((row) => (
                <tr key={row}>
                  <td className="p-2 text-xs font-medium text-[var(--color-text-secondary)]">
                    {row}
                  </td>
                  {data.col_labels.map((col) => {
                    const cell = data.cells.find(
                      (c) => c.row === row && c.col === col,
                    );
                    return (
                      <td key={col} className="p-1">
                        {cell ? (
                          <button
                            type="button"
                            className={`w-full rounded p-2 text-center text-xs transition-colors ${severityCellClass(cell.severity)}`}
                            onClick={() => onCellClick?.(cell)}
                            data-testid={`heatmap-cell-${row}-${col}`}
                            title={`${(cell.failure_rate * 100).toFixed(0)}% failure rate (${cell.sample_count} samples)`}
                          >
                            <span className="font-mono">
                              {(cell.failure_rate * 100).toFixed(0)}%
                            </span>
                            <Badge
                              variant={severityBadgeVariant(cell.severity)}
                              size="sm"
                            >
                              {cell.severity}
                            </Badge>
                          </button>
                        ) : (
                          <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
                            --
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {data && data.cells.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No failure patterns found for the selected dimensions.
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function severityCellClass(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-[var(--color-action-danger)]/15 hover:bg-[var(--color-action-danger)]/25";
    case "medium":
      return "bg-[var(--color-action-warning)]/15 hover:bg-[var(--color-action-warning)]/25";
    case "low":
      return "bg-[var(--color-action-success)]/15 hover:bg-[var(--color-action-success)]/25";
    default:
      return "bg-[var(--color-surface-tertiary)]";
  }
}
