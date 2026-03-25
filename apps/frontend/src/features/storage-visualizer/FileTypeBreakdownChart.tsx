/**
 * Donut chart showing file type distribution (PRD-19).
 *
 * Uses Recharts PieChart with CATEGORY_COLORS for colouring.
 */

import { Card, CardBody, CardHeader } from "@/components/composite";
import { ContextLoader } from "@/components/primitives";
import { TOOLTIP_CONTENT_STYLE } from "@/features/dashboard/performance/chartStyles";
import { formatBytes } from "@/lib/format";
import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useBreakdown } from "./hooks/use-storage-visualizer";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FALLBACK_COLOR = "#6B7280";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

interface ChartDatum {
  name: string;
  value: number;
  fileCount: number;
  fill: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FileTypeBreakdownChart() {
  const { data: breakdown, isLoading } = useBreakdown();

  const chartData: ChartDatum[] = useMemo(() => {
    if (!breakdown) return [];
    return breakdown.map((b) => ({
      name: CATEGORY_LABELS[b.category] ?? b.category,
      value: b.total_bytes,
      fileCount: b.file_count,
      fill: CATEGORY_COLORS[b.category] ?? FALLBACK_COLOR,
    }));
  }, [breakdown]);

  return (
    <Card elevation="sm">
      <CardHeader>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          File Type Breakdown
        </span>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <ContextLoader size={48} />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No breakdown data available.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatBytes(Number(value))}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={{ color: "var(--color-text-primary)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string, entry) => {
                  const payload = entry.payload as ChartDatum | undefined;
                  if (!payload) return value;
                  return `${value} (${formatBytes(payload.value)})`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}
