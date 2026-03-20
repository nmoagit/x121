/**
 * Line chart showing request volume over time (PRD-106).
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
   Types
   -------------------------------------------------------------------------- */

interface RequestVolumeChartProps {
  data: ApiMetric[];
  isLoading: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RequestVolumeChart({ data, isLoading }: RequestVolumeChartProps) {
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
          No request volume data available.
        </p>
      </Card>
    );
  }

  const chartData = data.map((m) => ({
    time: formatChartTime(m.period_start),
    requests: m.request_count,
  }));

  return (
    <Card padding="md">
      <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
        Request Volume
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="time" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} />
          <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
          <Line
            type="monotone"
            dataKey="requests"
            name="Requests"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
