import { useState } from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  AXIS_TICK_STYLE,
  GRID_STROKE,
  TOOLTIP_CONTENT_STYLE,
} from "@/features/dashboard/performance/chartStyles";

import type { EnrichedTemporalMetric, TrendDirection } from "./types";
import {
  DEFAULT_CENTERING_THRESHOLD,
  DEFAULT_DRIFT_THRESHOLD,
  DEFAULT_GRAIN_THRESHOLD,
  DRIFT_SEVERITY_COLORS,
  TREND_LABELS,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

type ViewMode = "drift" | "centering" | "grain";

interface DriftTrendChartProps {
  metrics: EnrichedTemporalMetric[];
  driftTrend: TrendDirection;
  isLoading: boolean;
  driftThreshold?: number;
  grainThreshold?: number;
  centeringThreshold?: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const VIEW_LABELS: Record<ViewMode, string> = {
  drift: "Drift Score",
  centering: "Centering Offset",
  grain: "Grain Match",
};

function getDotColor(
  severity: string | null | undefined,
): string {
  if (!severity) return "var(--color-text-muted)";
  return (
    DRIFT_SEVERITY_COLORS[severity as keyof typeof DRIFT_SEVERITY_COLORS] ??
    "var(--color-text-muted)"
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DriftTrendChart({
  metrics,
  driftTrend,
  isLoading,
  driftThreshold = DEFAULT_DRIFT_THRESHOLD,
  grainThreshold = DEFAULT_GRAIN_THRESHOLD,
  centeringThreshold = DEFAULT_CENTERING_THRESHOLD,
}: DriftTrendChartProps) {
  const [view, setView] = useState<ViewMode>("drift");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-text-muted)]">
          No temporal metrics available for this scene.
        </p>
      </Card>
    );
  }

  const chartData = metrics.map((m, idx) => ({
    index: idx + 1,
    segment_id: m.segment_id,
    drift_score: m.drift_score,
    centering_offset:
      m.centering_offset_x != null && m.centering_offset_y != null
        ? Math.sqrt(m.centering_offset_x ** 2 + m.centering_offset_y ** 2)
        : null,
    grain_match_score: m.grain_match_score,
    severity: m.drift_severity,
  }));

  const dataKey =
    view === "drift"
      ? "drift_score"
      : view === "centering"
        ? "centering_offset"
        : "grain_match_score";

  const threshold =
    view === "drift"
      ? driftThreshold
      : view === "centering"
        ? centeringThreshold
        : grainThreshold;

  const strokeColor =
    view === "drift"
      ? "#ef4444"
      : view === "centering"
        ? "#f59e0b"
        : "#22c55e";

  return (
    <Card padding="md">
      <Stack gap={3}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Temporal Continuity
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Trend: {TREND_LABELS[driftTrend]}
            </p>
          </div>
          <div className="flex gap-1">
            {(["drift", "centering", "grain"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === mode
                    ? "bg-[var(--color-surface-interactive)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              dataKey="index"
              tick={AXIS_TICK_STYLE}
              label={{
                value: "Segment",
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 11, fill: "var(--color-text-muted)" },
              }}
            />
            <YAxis tick={AXIS_TICK_STYLE} />
            <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
            <ReferenceLine
              y={threshold}
              stroke="var(--color-action-warning)"
              strokeDasharray="4 4"
              label={{
                value: "Threshold",
                position: "right",
                style: { fontSize: 10, fill: "var(--color-text-muted)" },
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              name={VIEW_LABELS[view]}
              stroke={strokeColor}
              strokeWidth={2}
              dot={(props: Record<string, unknown>) => {
                const { cx, cy, payload } = props as {
                  cx: number;
                  cy: number;
                  payload: { severity: string | null };
                };
                return (
                  <circle
                    key={`dot-${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={getDotColor(payload?.severity)}
                    stroke="none"
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Stack>
    </Card>
  );
}
