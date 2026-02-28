/**
 * QuotaStatusWidget -- progress bar showing user quota utilization
 * with time-until-reset display (PRD-93).
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody } from "@/components/composite";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/format";

import type { QuotaStatus } from "./types";
import { budgetBadgeVariant, budgetBarColor, PERIOD_TYPE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface QuotaStatusWidgetProps {
  status: QuotaStatus | null;
}

export function QuotaStatusWidget({ status }: QuotaStatusWidgetProps) {
  if (!status) {
    return (
      <div data-testid="quota-widget-empty">
        <Card elevation="flat">
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              No quota assigned.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const consumedPct = status.consumed_pct;
  const clampedPct = Math.min(consumedPct, 100);
  const periodLabel = PERIOD_TYPE_LABEL[status.quota.period_type] ?? status.quota.period_type;
  const barColor = budgetBarColor(consumedPct);
  const statusVariant = budgetBadgeVariant(consumedPct);

  // Calculate period end from period_start + period_type
  const periodResetIso = computePeriodEnd(status.quota.period_start, status.quota.period_type);
  const resetLabel = periodResetIso ? formatCountdown(periodResetIso) : "--";

  return (
    <div data-testid="quota-widget">
      <Card elevation="flat">
        <CardBody>
          <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Your Quota
              </span>
              <Badge variant="info" size="sm">{periodLabel}</Badge>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">
                <span data-testid="quota-consumed" className="font-medium tabular-nums">
                  {status.consumed_gpu_hours.toFixed(1)}h
                </span>
                {" / "}
                <span data-testid="quota-total" className="tabular-nums">
                  {status.quota.quota_gpu_hours.toFixed(1)}h
                </span>
              </span>
              <Badge variant={statusVariant} size="sm">
                {consumedPct.toFixed(0)}%
              </Badge>
            </div>

            {/* Progress bar */}
            <div
              role="progressbar"
              aria-valuenow={Math.round(consumedPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]"
            >
              <div
                data-testid="quota-progress-fill"
                className={cn(
                  "h-full rounded-[var(--radius-full)] transition-all duration-300",
                  barColor,
                )}
                style={{ width: `${clampedPct}%` }}
              />
            </div>

            {/* Reset countdown */}
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>Resets in</span>
              <span data-testid="quota-reset" className="font-medium tabular-nums">
                {resetLabel}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Compute the end of the current period from a start date and period type. */
function computePeriodEnd(periodStart: string, periodType: string): string | null {
  const start = new Date(periodStart);
  if (Number.isNaN(start.getTime())) return null;

  switch (periodType) {
    case "daily":
      start.setDate(start.getDate() + 1);
      break;
    case "weekly":
      start.setDate(start.getDate() + 7);
      break;
    case "monthly":
      start.setMonth(start.getMonth() + 1);
      break;
    default:
      return null;
  }

  return start.toISOString();
}
