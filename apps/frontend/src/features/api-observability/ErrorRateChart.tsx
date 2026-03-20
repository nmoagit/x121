/**
 * Line chart showing error rate breakdown (4xx vs 5xx) over time (PRD-106).
 */

import {
  CartesianGrid,
  Line,
  LineChart,
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
   Helpers
   -------------------------------------------------------------------------- */

function computeErrorRate(errors: number, total: number): number {
  if (total === 0) return 0;
  return (errors / total) * 100;
}

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ErrorRateChartProps {
  data: ApiMetric[];
  isLoading: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ErrorRateChart({ data, isLoading }: ErrorRateChartProps) {
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
          No error rate data available.
        </p>
      </Card>
    );
  }

  const chartData = data.map((m) => ({
    time: formatChartTime(m.period_start),
    error_4xx: computeErrorRate(m.error_count_4xx, m.request_count),
    error_5xx: computeErrorRate(m.error_count_5xx, m.request_count),
  }));

  return (
    <Card padding="md">
      <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
        Error Rate (%)
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="time" tick={AXIS_TICK_STYLE} />
          <YAxis domain={[0, "auto"]} tick={AXIS_TICK_STYLE} />
          <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
          <Line
            type="monotone"
            dataKey="error_4xx"
            name="4xx Rate %"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="error_5xx"
            name="5xx Rate %"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
