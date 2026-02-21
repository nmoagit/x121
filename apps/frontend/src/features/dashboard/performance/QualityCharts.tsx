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
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import type { PerformanceTrendPoint } from "@/features/dashboard/hooks/use-performance";
import { formatDate } from "@/lib/format";
import { AXIS_TICK_STYLE, GRID_STROKE, TOOLTIP_CONTENT_STYLE } from "./chartStyles";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface QualityChartsProps {
  data: PerformanceTrendPoint[];
  isLoading: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QualityCharts({ data, isLoading }: QualityChartsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-text-muted)]">
          No quality data available for the selected period.
        </p>
      </Card>
    );
  }

  const chartData = data.map((point) => ({
    ...point,
    formattedDate: formatDate(point.period),
  }));

  return (
    <Stack gap={4}>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        Quality & Performance Trends
      </h3>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Time per frame trend */}
        <Card padding="md">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
            Time per Frame (ms)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="formattedDate" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
              <Line
                type="monotone"
                dataKey="avg_time_per_frame_ms"
                name="Avg ms/frame"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Likeness score trend */}
        <Card padding="md">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
            Likeness Score
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="formattedDate" tick={AXIS_TICK_STYLE} />
              <YAxis domain={[0, 1]} tick={AXIS_TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
              <Line
                type="monotone"
                dataKey="avg_likeness_score"
                name="Avg Likeness"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* VRAM peak trend */}
        <Card padding="md">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
            VRAM Peak (MB)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="formattedDate" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
              <Line
                type="monotone"
                dataKey="avg_vram_peak_mb"
                name="Avg VRAM MB"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Job count trend */}
        <Card padding="md">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
            Jobs per Period
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="formattedDate" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
              <Line
                type="monotone"
                dataKey="job_count"
                name="Jobs"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </Stack>
  );
}
