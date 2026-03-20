/**
 * Line chart showing response time percentiles (P50, P95, P99) over time (PRD-106).
 */

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
import { WireframeLoader } from "@/components/primitives";
import {
  AXIS_TICK_STYLE,
  GRID_STROKE,
  TOOLTIP_CONTENT_STYLE,
} from "@/features/dashboard/performance/chartStyles";

import type { ApiMetric } from "./types";
import { formatChartTime } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Response time threshold line (ms) for visual reference. */
const THRESHOLD_MS = 500;

const LINE_COLORS = {
  p50: "#10b981",
  p95: "#f59e0b",
  p99: "#ef4444",
} as const;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ResponseTimeChartProps {
  data: ApiMetric[];
  isLoading: boolean;
  thresholdMs?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ResponseTimeChart({
  data,
  isLoading,
  thresholdMs = THRESHOLD_MS,
}: ResponseTimeChartProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <WireframeLoader size={64} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-text-muted)]">
          No response time data available.
        </p>
      </Card>
    );
  }

  const chartData = data.map((m) => ({
    time: formatChartTime(m.period_start),
    p50: m.response_time_p50_ms,
    p95: m.response_time_p95_ms,
    p99: m.response_time_p99_ms,
  }));

  return (
    <Card padding="md">
      <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
        Response Time (ms)
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="time" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} />
          <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
          <ReferenceLine
            y={thresholdMs}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: `${thresholdMs}ms`, position: "right", fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="p50"
            name="P50"
            stroke={LINE_COLORS.p50}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p95"
            name="P95"
            stroke={LINE_COLORS.p95}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p99"
            name="P99"
            stroke={LINE_COLORS.p99}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
