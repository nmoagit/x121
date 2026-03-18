/**
 * Admin-only segment showing cloud GPU pod count and budget status.
 * Clicking navigates to the cloud GPU admin page.
 */

import { Tooltip } from "@/components/primitives";
import { Cloud } from "@/tokens/icons";

import { FooterSegment, Separator, StatusDot } from "./FooterSegment";
import type { CloudGpuInfo, ServiceHealth } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function budgetToHealth(status: CloudGpuInfo["budget_status"]): ServiceHealth {
  if (status === "ok") return "healthy";
  if (status === "warning") return "degraded";
  return "down";
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/hr`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CloudGpuSegmentProps {
  cloudGpu: CloudGpuInfo | null;
}

export function CloudGpuSegment({ cloudGpu }: CloudGpuSegmentProps) {
  if (!cloudGpu) return null;

  const tooltipContent = (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium">Cloud GPU</div>
      <div>{cloudGpu.active_pods} pod{cloudGpu.active_pods !== 1 ? "s" : ""} active</div>
      <div>Cost: {formatCost(cloudGpu.cost_per_hour_cents)}</div>
      <div className="flex items-center gap-1.5">
        <StatusDot health={budgetToHealth(cloudGpu.budget_status)} />
        <span>Budget: {cloudGpu.budget_status}</span>
      </div>
    </div>
  );

  return (
    <>
      <Tooltip content={tooltipContent} side="top">
        <FooterSegment href="/admin/infrastructure" label="Cloud GPU status">
          <Cloud size={14} aria-hidden="true" />
          <StatusDot health={budgetToHealth(cloudGpu.budget_status)} />
          <span className="tabular-nums">{cloudGpu.active_pods}</span>
          <span className="hidden md:inline">GPU</span>
        </FooterSegment>
      </Tooltip>
      <Separator />
    </>
  );
}
