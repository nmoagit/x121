import { Stack } from "@/components/layout";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_BODY, TERMINAL_HEADER_TITLE } from "@/lib/ui-classes";
import { useThresholds, useWorkerMetrics } from "@/features/admin/hooks/use-hardware";
import type { GpuMetricRow } from "@/features/admin/hooks/use-hardware";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

interface TimeRange {
  id: string;
  label: string;
  hours: number;
}

const TIME_RANGES: TimeRange[] = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
];

const LINE_COMMON = { type: "monotone" as const, strokeWidth: 2, dot: false, activeDot: { r: 3 } };

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

interface ChartDataPoint {
  time: string;
  timestamp: number;
  temperature: number;
  vramPercent: number;
  utilization: number;
}

function toChartData(rows: GpuMetricRow[]): ChartDataPoint[] {
  return rows.map((row) => ({
    time: new Date(row.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    timestamp: new Date(row.recorded_at).getTime(),
    temperature: row.temperature_celsius,
    vramPercent:
      row.vram_total_mb > 0 ? Math.round((row.vram_used_mb / row.vram_total_mb) * 100) : 0,
    utilization: row.utilization_percent,
  }));
}

function getSinceIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MetricsChartProps {
  workerId: number;
}

export function MetricsChart({ workerId }: MetricsChartProps) {
  const [rangeId, setRangeId] = useState("1h");
  const defaultRange = TIME_RANGES[0] as TimeRange;
  const activeRange = TIME_RANGES.find((r) => r.id === rangeId) ?? defaultRange;
  const since = useMemo(() => getSinceIso(activeRange.hours), [activeRange.hours]);

  const { data: rows, isLoading } = useWorkerMetrics(workerId, since);
  const { data: thresholds } = useThresholds();
  const chartData = useMemo(() => toChartData(rows ?? []), [rows]);

  const tempThreshold = thresholds?.find(
    (t) => t.metric_name === "temperature_celsius" && t.is_enabled && t.worker_id === null,
  );

  const colors = useMemo(
    () => ({
      temperature: getCssVar("--color-action-danger", "#da3633"),
      vram: getCssVar("--color-action-primary", "#1f6feb"),
      utilization: getCssVar("--color-action-success", "#3fb950"),
      warning: getCssVar("--color-action-warning", "#d29922"),
      grid: getCssVar("--color-border-default", "#3d444d"),
      text: getCssVar("--color-text-muted", "#656c76"),
    }),
    [],
  );

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <Stack direction="horizontal" gap={3} align="center" justify="between">
          <span className={TERMINAL_HEADER_TITLE}>
            Worker {workerId} -- Historical Metrics
          </span>
          <Stack direction="horizontal" gap={1}>
            {TIME_RANGES.map((range) => (
              <Button
                key={range.id}
                variant={range.id === rangeId ? "primary" : "ghost"}
                size="sm"
                onClick={() => setRangeId(range.id)}
              >
                {range.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </div>

      <div className={TERMINAL_BODY}>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <WireframeLoader size={48} />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No metrics available for this time range.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: colors.text }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: colors.text }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-surface-secondary)",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-text-primary)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              <Line
                {...LINE_COMMON}
                dataKey="temperature"
                name="Temp (C)"
                stroke={colors.temperature}
              />
              <Line {...LINE_COMMON} dataKey="vramPercent" name="VRAM (%)" stroke={colors.vram} />
              <Line
                {...LINE_COMMON}
                dataKey="utilization"
                name="Util (%)"
                stroke={colors.utilization}
              />

              {tempThreshold && (
                <>
                  <ReferenceLine
                    y={tempThreshold.warning_value}
                    stroke={colors.warning}
                    strokeDasharray="6 3"
                    label={{ value: "Warn", position: "right", fontSize: 10, fill: colors.warning }}
                  />
                  <ReferenceLine
                    y={tempThreshold.critical_value}
                    stroke={colors.temperature}
                    strokeDasharray="6 3"
                    label={{
                      value: "Crit",
                      position: "right",
                      fontSize: 10,
                      fill: colors.temperature,
                    }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
