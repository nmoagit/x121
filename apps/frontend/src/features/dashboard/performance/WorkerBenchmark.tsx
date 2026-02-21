import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useWorkersComparison,
  type WorkerPerformanceSummary,
} from "@/features/dashboard/hooks/use-performance";
import { AXIS_TICK_STYLE, GRID_STROKE, TOOLTIP_CONTENT_STYLE } from "./chartStyles";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WorkerBenchmarkProps {
  from: string;
  to: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PIE_COLORS = ["#10b981", "#d1d5db"];
const BAR_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerBenchmark({ from, to }: WorkerBenchmarkProps) {
  const { data: workers, isLoading } = useWorkersComparison(from, to);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!workers || workers.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-text-muted)]">
          No worker performance data available for the selected period.
        </p>
      </Card>
    );
  }

  // Build speed comparison data.
  const speedData = workers.map((w) => ({
    name: `Worker ${w.worker_id}`,
    "Avg ms/frame": w.avg_time_per_frame_ms ?? 0,
    "Avg GPU Time (ms)": w.avg_gpu_time_ms ?? 0,
  }));

  // Build ranking table: sorted by avg_time_per_frame_ms (fastest first).
  const ranked = [...workers].sort(
    (a, b) => (a.avg_time_per_frame_ms ?? Infinity) - (b.avg_time_per_frame_ms ?? Infinity),
  );

  return (
    <Stack gap={4}>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        Worker Benchmarking
      </h3>

      {/* Worker cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workers.map((w) => (
          <WorkerCard key={w.worker_id} worker={w} />
        ))}
      </div>

      {/* Speed comparison bar chart */}
      <Card padding="md">
        <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
          Speed Comparison Across Workers
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={speedData}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
            <YAxis tick={AXIS_TICK_STYLE} />
            <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
            <Legend />
            <Bar dataKey="Avg ms/frame" fill={BAR_COLORS[0]} />
            <Bar dataKey="Avg GPU Time (ms)" fill={BAR_COLORS[1]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Hardware efficiency ranking table */}
      <Card padding="md">
        <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
          Hardware Efficiency Ranking
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                  Rank
                </th>
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                  Worker
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Avg ms/frame
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Avg VRAM (MB)
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Max VRAM (MB)
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Jobs
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((w, i) => (
                <tr
                  key={w.worker_id}
                  className="border-b border-[var(--color-border-default)]"
                >
                  <td className="px-4 py-2 text-[var(--color-text-primary)]">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-[var(--color-text-primary)]">
                    Worker {w.worker_id}
                  </td>
                  <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                    {w.avg_time_per_frame_ms?.toFixed(1) ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                    {w.avg_vram_peak_mb?.toFixed(0) ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                    {w.max_vram_peak_mb ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                    {w.job_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Worker card sub-component
   -------------------------------------------------------------------------- */

function WorkerCard({ worker }: { worker: WorkerPerformanceSummary }) {
  // Utilization: GPU time / wall time.
  const gpuTime = worker.total_gpu_time_ms ?? 0;
  const wallTime = worker.total_wall_time_ms ?? 1;
  const utilization = wallTime > 0 ? Math.min((gpuTime / wallTime) * 100, 100) : 0;
  const idle = 100 - utilization;

  const pieData = [
    { name: "Generating", value: utilization },
    { name: "Idle", value: idle },
  ];

  return (
    <Card padding="md">
      <Stack gap={3}>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Worker {worker.worker_id}
        </p>

        <div className="flex items-center gap-4">
          {/* Utilization pie chart */}
          <div className="h-16 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius="60%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="min-w-0 text-xs text-[var(--color-text-muted)]">
            <p>{utilization.toFixed(0)}% GPU utilization</p>
            <p>{worker.job_count} jobs completed</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[var(--color-text-muted)]">Avg ms/frame</span>
            <p className="font-medium text-[var(--color-text-primary)]">
              {worker.avg_time_per_frame_ms?.toFixed(1) ?? "-"}
            </p>
          </div>
          <div>
            <span className="text-[var(--color-text-muted)]">Avg VRAM</span>
            <p className="font-medium text-[var(--color-text-primary)]">
              {worker.avg_vram_peak_mb?.toFixed(0) ?? "-"} MB
            </p>
          </div>
        </div>
      </Stack>
    </Card>
  );
}
