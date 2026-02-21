import { Card, CardBody, CardFooter, CardHeader } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import { GpuGauge } from "@/features/admin/components/GpuGauge";
import { RestartButton } from "@/features/admin/components/RestartButton";
import type { MetricThreshold, WorkerCurrentMetrics } from "@/features/admin/hooks/use-hardware";
import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WorkerCardProps {
  metrics: WorkerCurrentMetrics;
  thresholds: MetricThreshold[];
  isSelected: boolean;
  onSelect: (workerId: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** A metric reading is considered stale if older than 30 seconds. */
const STALE_THRESHOLD_MS = 30_000;

function isOnline(recordedAt: string): boolean {
  const age = Date.now() - new Date(recordedAt).getTime();
  return age < STALE_THRESHOLD_MS;
}

function findThreshold(
  thresholds: MetricThreshold[],
  workerId: number,
  metricName: string,
): { warning: number; critical: number } {
  const perWorker = thresholds.find(
    (t) => t.worker_id === workerId && t.metric_name === metricName && t.is_enabled,
  );
  if (perWorker) return { warning: perWorker.warning_value, critical: perWorker.critical_value };

  const global = thresholds.find(
    (t) => t.worker_id === null && t.metric_name === metricName && t.is_enabled,
  );
  if (global) return { warning: global.warning_value, critical: global.critical_value };

  return DEFAULT_THRESHOLDS[metricName] ?? { warning: 70, critical: 90 };
}

const DEFAULT_THRESHOLDS: Record<string, { warning: number; critical: number }> = {
  temperature_celsius: { warning: 75, critical: 90 },
  vram_percent: { warning: 80, critical: 95 },
  utilization_percent: { warning: 80, critical: 95 },
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerCard({ metrics, thresholds, isSelected, onSelect }: WorkerCardProps) {
  const online = isOnline(metrics.recorded_at);
  const tempThresholds = findThreshold(thresholds, metrics.worker_id, "temperature_celsius");
  const vramThresholds = findThreshold(thresholds, metrics.worker_id, "vram_percent");
  const utilThresholds = findThreshold(thresholds, metrics.worker_id, "utilization_percent");

  return (
    <Card
      elevation="md"
      padding="none"
      className={cn(
        "cursor-pointer transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-lg)]",
        isSelected && "ring-2 ring-[var(--color-border-focus)]",
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onSelect(metrics.worker_id)}
        aria-pressed={isSelected}
      >
        <CardHeader className="px-[var(--spacing-4)] pt-[var(--spacing-4)]">
          <Stack direction="horizontal" gap={3} align="center" justify="between">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Worker {metrics.worker_id} / GPU {metrics.gpu_index}
            </span>
            <Badge variant={online ? "success" : "danger"} size="sm">
              {online ? "Online" : "Offline"}
            </Badge>
          </Stack>
        </CardHeader>

        <CardBody className="px-[var(--spacing-4)]">
          <Stack gap={3}>
            <GpuGauge
              label="Temperature"
              value={metrics.temperature_celsius}
              max={100}
              unit="C"
              warningThreshold={tempThresholds.warning}
              criticalThreshold={tempThresholds.critical}
            />

            <GpuGauge
              label="VRAM"
              value={metrics.vram_used_mb}
              max={metrics.vram_total_mb}
              unit=" MB"
              warningThreshold={(vramThresholds.warning / 100) * metrics.vram_total_mb}
              criticalThreshold={(vramThresholds.critical / 100) * metrics.vram_total_mb}
            />

            <GpuGauge
              label="Utilization"
              value={metrics.utilization_percent}
              max={100}
              unit="%"
              warningThreshold={utilThresholds.warning}
              criticalThreshold={utilThresholds.critical}
            />

            {metrics.power_draw_watts !== null && (
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <span>Power</span>
                <span className="tabular-nums">{Math.round(metrics.power_draw_watts)} W</span>
              </div>
            )}

            {metrics.fan_speed_percent !== null && (
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <span>Fan</span>
                <span className="tabular-nums">{Math.round(metrics.fan_speed_percent)}%</span>
              </div>
            )}
          </Stack>
        </CardBody>
      </button>

      <CardFooter className="px-[var(--spacing-4)] pb-[var(--spacing-3)]">
        <Stack direction="horizontal" gap={3} justify="end">
          <RestartButton workerId={metrics.worker_id} />
        </Stack>
      </CardFooter>
    </Card>
  );
}
