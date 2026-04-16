/**
 * BudgetDashboard -- per-project budget overview with progress bar,
 * trend projection, and consumption history chart (PRD-93).
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";

import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";
import type { BudgetStatus, DailyConsumption } from "./types";
import {
  budgetBarColor,
  PERIOD_TYPE_LABEL,
  TREND_DIRECTION_BADGE,
  TREND_DIRECTION_LABEL,
} from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function BudgetProgressBar({ consumedPct }: { consumedPct: number }) {
  const clampedPct = Math.min(consumedPct, 100);
  const barColor = budgetBarColor(consumedPct);

  return (
    <div className="w-full" role="progressbar" aria-valuenow={Math.round(consumedPct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-muted)]">Used</span>
        <span className={`tabular-nums ${TYPO_INPUT_LABEL}`}>
          {consumedPct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]">
        <div
          data-testid="budget-progress-fill"
          className={cn("h-full rounded-[var(--radius-full)] transition-all duration-300", barColor)}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
}

function TrendProjectionSection({ trend }: { trend: BudgetStatus["trend"] }) {
  const trendLabel = TREND_DIRECTION_LABEL[trend.trend_direction] ?? trend.trend_direction;
  const trendVariant = TREND_DIRECTION_BADGE[trend.trend_direction] ?? "default";

  return (
    <div data-testid="trend-projection" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">Trend</span>
        <Badge variant={trendVariant} size="sm">{trendLabel}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">Daily avg</span>
          <span className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
            {trend.daily_avg.toFixed(2)}h
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">Days until exhaustion</span>
          <span className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
            {trend.days_until_exhaustion !== null ? `${Math.round(trend.days_until_exhaustion)}d` : "--"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ConsumptionChart({ history }: { history: DailyConsumption[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No consumption data yet.
      </p>
    );
  }

  const maxHours = Math.max(...history.map((d) => d.total_gpu_hours), 0.01);

  return (
    <div data-testid="consumption-chart" className="flex items-end gap-1 h-24">
      {history.map((day) => {
        const height = (day.total_gpu_hours / maxHours) * 100;

        return (
          <div
            key={day.day}
            className="flex-1 flex flex-col justify-end items-center gap-0"
            title={`${day.day}: ${day.total_gpu_hours.toFixed(2)}h`}
          >
            <div
              className="w-full bg-[var(--color-action-primary)] rounded-t-sm"
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface BudgetDashboardProps {
  status: BudgetStatus | null;
  history?: DailyConsumption[];
}

export function BudgetDashboard({ status, history = [] }: BudgetDashboardProps) {
  if (!status) {
    return (
      <div data-testid="budget-dashboard-empty">
        <Card elevation="flat">
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              No budget configured for this project.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const periodLabel = PERIOD_TYPE_LABEL[status.budget.period_type] ?? status.budget.period_type;

  return (
    <div data-testid="budget-dashboard">
      <Card elevation="flat">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Budget Overview
            </span>
            <Badge variant="info" size="sm">{periodLabel}</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[var(--color-text-muted)]">Budget</span>
                <span data-testid="stat-budget" className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
                  {status.budget.budget_gpu_hours.toFixed(1)}h
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[var(--color-text-muted)]">Consumed</span>
                <span data-testid="stat-consumed" className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
                  {status.consumed_gpu_hours.toFixed(1)}h
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[var(--color-text-muted)]">Remaining</span>
                <span data-testid="stat-remaining" className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
                  {status.remaining_gpu_hours.toFixed(1)}h
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <BudgetProgressBar consumedPct={status.consumed_pct} />

            {/* Trend projection */}
            <TrendProjectionSection trend={status.trend} />

            {/* Consumption chart */}
            {history.length > 0 && (
              <div className="pt-3 border-t border-[var(--color-border-default)]">
                <span className="text-xs text-[var(--color-text-muted)] mb-2 block">
                  Daily Consumption
                </span>
                <ConsumptionChart history={history} />
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
