import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useWorkflowComparison,
  type WorkflowPerformanceSummary,
} from "@/features/dashboard/hooks/use-performance";
import { AXIS_TICK_STYLE, GRID_STROKE, TOOLTIP_CONTENT_STYLE } from "./chartStyles";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WorkflowComparisonProps {
  from: string;
  to: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BAR_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkflowComparison({ from, to }: WorkflowComparisonProps) {
  const [idsInput, setIdsInput] = useState("");

  const workflowIds = idsInput
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  const { data, isLoading, isError } = useWorkflowComparison(workflowIds, from, to);

  const summaries = data?.summaries ?? [];

  // Build chart data: one group per metric, one bar per workflow.
  const speedData = summaries.map((s) => ({
    name: `Workflow ${s.workflow_id}`,
    "Avg ms/frame": s.avg_time_per_frame_ms ?? 0,
    "p95 ms/frame": s.p95_time_per_frame_ms ?? 0,
  }));

  const resourceData = summaries.map((s) => ({
    name: `Workflow ${s.workflow_id}`,
    "Avg GPU Time (ms)": s.avg_gpu_time_ms ?? 0,
    "Avg VRAM (MB)": s.avg_vram_peak_mb ?? 0,
    "Max VRAM (MB)": s.max_vram_peak_mb ?? 0,
  }));

  return (
    <Stack gap={4}>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        Workflow Comparison
      </h3>

      <Card padding="md">
        <Input
          label="Workflow IDs (comma-separated, min 2)"
          value={idsInput}
          onChange={(e) => setIdsInput(e.target.value)}
          placeholder="e.g. 1, 2, 3"
        />
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {isError && (
        <Card padding="md">
          <p className="text-sm text-[var(--color-action-danger)]">
            Failed to load comparison data.
          </p>
        </Card>
      )}

      {summaries.length >= 2 && (
        <Stack gap={4}>
          {/* Trade-off summary */}
          <TradeoffSummary summaries={summaries} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Speed comparison */}
            <Card padding="md">
              <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
                Speed Comparison
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={speedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
                  <Legend />
                  <Bar dataKey="Avg ms/frame" fill={BAR_COLORS[0]} />
                  <Bar dataKey="p95 ms/frame" fill={BAR_COLORS[1]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Resource comparison */}
            <Card padding="md">
              <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
                Resource Usage
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={resourceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
                  <Legend />
                  <Bar dataKey="Avg VRAM (MB)" fill={BAR_COLORS[2]} />
                  <Bar dataKey="Max VRAM (MB)" fill={BAR_COLORS[3]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </Stack>
      )}

      {workflowIds.length < 2 && !isLoading && (
        <Card padding="md">
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter at least 2 workflow IDs to compare.
          </p>
        </Card>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Tradeoff summary sub-component
   -------------------------------------------------------------------------- */

function TradeoffSummary({ summaries }: { summaries: WorkflowPerformanceSummary[] }) {
  if (summaries.length < 2) return null;

  // Find fastest and highest quality.
  const sorted = [...summaries].sort(
    (a, b) => (a.avg_time_per_frame_ms ?? Infinity) - (b.avg_time_per_frame_ms ?? Infinity),
  );
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];

  if (!fastest || !slowest) return null;

  const speedDiffPct =
    fastest.avg_time_per_frame_ms && slowest.avg_time_per_frame_ms
      ? (
          ((slowest.avg_time_per_frame_ms - fastest.avg_time_per_frame_ms) /
            fastest.avg_time_per_frame_ms) *
          100
        ).toFixed(1)
      : null;

  return (
    <Card padding="md">
      <p className="text-sm text-[var(--color-text-primary)]">
        <span className="font-semibold">Workflow {fastest.workflow_id}</span> is the fastest
        {speedDiffPct && (
          <span className="text-[var(--color-text-muted)]">
            {" "}
            ({speedDiffPct}% faster than Workflow {slowest.workflow_id})
          </span>
        )}
        {". "}
        {fastest.avg_likeness_score !== null &&
          slowest.avg_likeness_score !== null &&
          fastest.avg_likeness_score < slowest.avg_likeness_score && (
            <span className="text-[var(--color-text-muted)]">
              Workflow {slowest.workflow_id} has{" "}
              {(
                ((slowest.avg_likeness_score - fastest.avg_likeness_score) /
                  fastest.avg_likeness_score) *
                100
              ).toFixed(1)}
              % higher quality.
            </span>
          )}
      </p>
    </Card>
  );
}
