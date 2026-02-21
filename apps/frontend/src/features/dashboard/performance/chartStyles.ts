/**
 * Shared Recharts styling constants for performance dashboard charts.
 *
 * Prevents duplication of identical Tooltip / axis tick styling
 * across QualityCharts, WorkflowComparison, and WorkerBenchmark.
 */

import type { CSSProperties } from "react";

/** Standard Tooltip content style used by all performance charts. */
export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  backgroundColor: "var(--color-surface-secondary)",
  border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
};

/** Standard axis tick style (small, muted text). */
export const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: "var(--color-text-muted)",
} as const;

/** Standard CartesianGrid stroke colour. */
export const GRID_STROKE = "var(--color-border-default)";
