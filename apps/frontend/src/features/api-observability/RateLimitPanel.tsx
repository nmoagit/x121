/**
 * Rate limit utilization panel with per-key progress bars (PRD-106).
 *
 * Color coding: green (<60%), yellow (60-80%), red (>80%).
 */

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Activity } from "@/tokens/icons";

import { useRateLimits } from "./hooks/use-api-observability";
import type { RateLimitUtilization } from "./types";
import { UTILIZATION_THRESHOLDS } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function utilizationColor(pct: number): string {
  if (pct >= UTILIZATION_THRESHOLDS.high) return "bg-[var(--color-action-danger)]";
  if (pct >= UTILIZATION_THRESHOLDS.low) return "bg-[var(--color-action-warning)]";
  return "bg-[var(--color-action-success)]";
}

function utilizationLabel(pct: number): string {
  if (pct >= UTILIZATION_THRESHOLDS.high) return "Critical";
  if (pct >= UTILIZATION_THRESHOLDS.low) return "Warning";
  return "Normal";
}

/* --------------------------------------------------------------------------
   Sub-component: utilization row
   -------------------------------------------------------------------------- */

interface UtilizationRowProps {
  item: RateLimitUtilization;
}

function UtilizationRow({ item }: UtilizationRowProps) {
  const pct = Math.min(item.utilization_pct, 100);
  const colorClass = utilizationColor(pct);

  return (
    <div className="space-y-[var(--spacing-1)]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--color-text-primary)]">
          Key #{item.api_key_id}
        </span>
        <span className="text-[var(--color-text-muted)]">
          {item.requests_made} / {item.rate_limit} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]">
        <div
          className={cn("h-full rounded-[var(--radius-full)] transition-all", colorClass)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`API key ${item.api_key_id}: ${utilizationLabel(pct)}`}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RateLimitPanel() {
  const { data: limits, isLoading, error } = useRateLimits();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-6)]">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (error || !limits) {
    return (
      <p className="py-[var(--spacing-4)] text-center text-sm text-[var(--color-text-muted)]">
        Failed to load rate limit data.
      </p>
    );
  }

  if (limits.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-sm text-[var(--color-text-muted)]">
          No rate limit data available.
        </p>
      </Card>
    );
  }

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Activity size={16} className="text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Rate Limit Utilization
          </span>
        </div>
      </CardHeader>
      <CardBody className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="space-y-[var(--spacing-3)]">
          {limits.map((item) => (
            <UtilizationRow key={item.id} item={item} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
