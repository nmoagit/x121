import { useMemo, useState } from "react";

import { Card } from "@/components/composite/Card";
import { Tabs } from "@/components/composite/Tabs";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { AlertConfig } from "@/features/dashboard/performance/AlertConfig";
import { QualityCharts } from "@/features/dashboard/performance/QualityCharts";
import { WorkerBenchmark } from "@/features/dashboard/performance/WorkerBenchmark";
import { WorkflowComparison } from "@/features/dashboard/performance/WorkflowComparison";
import {
  usePerformanceOverview,
  usePerformanceTrend,
  presetToRange,
  type DatePreset,
  type PerformanceOverview,
} from "@/features/dashboard/hooks/use-performance";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "quality", label: "Quality Trends" },
  { id: "comparison", label: "Workflow Comparison" },
  { id: "workers", label: "Worker Benchmarking" },
  { id: "alerts", label: "Alert Thresholds" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PerformanceDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const { from, to } = useMemo(() => presetToRange(datePreset), [datePreset]);

  const { data: overview, isLoading: overviewLoading } = usePerformanceOverview(from, to);
  const { data: trendData, isLoading: trendLoading } = usePerformanceTrend(from, to, "day");

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Performance Dashboard
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Monitor generation performance, quality metrics, and resource utilization.
            </p>
          </div>

          {/* Date range selector */}
          <div className="flex gap-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDatePreset(preset.value)}
                className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors ${
                  datePreset === preset.value
                    ? "bg-[var(--color-action-primary)] text-white"
                    : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab overview={overview} isLoading={overviewLoading} />
        )}

        {activeTab === "quality" && (
          <QualityCharts data={trendData ?? []} isLoading={trendLoading} />
        )}

        {activeTab === "comparison" && <WorkflowComparison from={from} to={to} />}

        {activeTab === "workers" && <WorkerBenchmark from={from} to={to} />}

        {activeTab === "alerts" && <AlertConfig />}
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Overview tab sub-component
   -------------------------------------------------------------------------- */

function OverviewTab({
  overview,
  isLoading,
}: {
  overview?: PerformanceOverview;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!overview) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-text-muted)]">
          No performance data available for the selected period.
        </p>
      </Card>
    );
  }

  return (
    <Stack gap={4}>
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total GPU Hours" value={overview.total_gpu_hours.toFixed(1)} unit="hrs" />
        <KpiCard
          label="Avg Time/Frame"
          value={overview.avg_time_per_frame_ms.toFixed(1)}
          unit="ms"
        />
        <KpiCard label="Peak VRAM" value={String(overview.peak_vram_mb)} unit="MB" />
        <KpiCard label="Total Jobs" value={overview.total_jobs.toLocaleString()} />
        <KpiCard label="Total Frames" value={overview.total_frames.toLocaleString()} />
      </div>

      {/* Top / bottom performers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkflowTable title="Top Performers (Fastest)" workflows={overview.top_workflows} />
        <WorkflowTable title="Bottom Performers (Slowest)" workflows={overview.bottom_workflows} />
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   KPI card sub-component
   -------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <Card padding="md">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">{unit}</span>}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Workflow table sub-component
   -------------------------------------------------------------------------- */

function WorkflowTable({
  title,
  workflows,
}: {
  title: string;
  workflows: PerformanceOverview["top_workflows"];
}) {
  return (
    <Card padding="md">
      <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">{title}</p>
      {workflows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-1.5 text-left font-medium text-[var(--color-text-muted)]">
                  Workflow
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-[var(--color-text-muted)]">
                  Avg ms/frame
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-[var(--color-text-muted)]">
                  Avg VRAM (MB)
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-[var(--color-text-muted)]">
                  Jobs
                </th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr
                  key={w.workflow_id}
                  className="border-b border-[var(--color-border-default)]"
                >
                  <td className="px-3 py-1.5 text-[var(--color-text-primary)]">
                    Workflow {w.workflow_id}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[var(--color-text-secondary)]">
                    {w.avg_time_per_frame_ms?.toFixed(1) ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[var(--color-text-secondary)]">
                    {w.avg_vram_peak_mb?.toFixed(0) ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[var(--color-text-secondary)]">
                    {w.job_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
