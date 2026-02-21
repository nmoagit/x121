import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GpuGaugeProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

type SeverityLevel = "normal" | "warning" | "critical";

function getSeverity(value: number, warning: number, critical: number): SeverityLevel {
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "normal";
}

const SEVERITY_BAR_CLASSES: Record<SeverityLevel, string> = {
  normal: "bg-[var(--color-action-success)]",
  warning: "bg-[var(--color-action-warning)]",
  critical: "bg-[var(--color-action-danger)]",
};

const SEVERITY_TEXT_CLASSES: Record<SeverityLevel, string> = {
  normal: "text-[var(--color-action-success)]",
  warning: "text-[var(--color-action-warning)]",
  critical: "text-[var(--color-action-danger)]",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GpuGauge({
  label,
  value,
  max,
  unit,
  warningThreshold,
  criticalThreshold,
}: GpuGaugeProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const severity = getSeverity(value, warningThreshold, criticalThreshold);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", SEVERITY_TEXT_CLASSES[severity])}>
          {Math.round(value)}
          {unit} / {Math.round(max)}
          {unit}
        </span>
      </div>

      <div
        className="relative h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]"
        role="progressbar"
        tabIndex={0}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-label={`${label}: ${Math.round(value)}${unit} of ${Math.round(max)}${unit}`}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-[var(--radius-full)]",
            "transition-all duration-500 ease-[var(--ease-default)]",
            SEVERITY_BAR_CLASSES[severity],
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
