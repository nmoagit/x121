/**
 * EstimationCard — displays a batch estimate summary (PRD-61).
 *
 * Shows total GPU hours, wall-clock hours (with worker context), disk usage,
 * confidence indicator, and an expandable per-scene breakdown.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";

import type { BatchEstimate } from "./types";
import {
  CONFIDENCE_COLORS,
  CONFIDENCE_LABELS,
  confidenceBadgeVariant,
} from "./types";

/** Seconds per hour -- mirrors `SECS_PER_HOUR` in `core/src/estimation.rs`. */
const SECS_PER_HOUR = 3600;

/** Megabytes per gigabyte -- mirrors `MB_PER_GB` in `core/src/estimation.rs`. */
const MB_PER_GB = 1024;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface EstimationCardProps {
  estimate: BatchEstimate | null;
}

/* --------------------------------------------------------------------------
   Stat display helper
   -------------------------------------------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span
        data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Confidence indicator
   -------------------------------------------------------------------------- */

function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const label =
    CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS] ??
    "Unknown";
  const color =
    CONFIDENCE_COLORS[confidence as keyof typeof CONFIDENCE_COLORS] ??
    "var(--color-text-muted)";

  return (
    <div className="flex items-center gap-2">
      <span
        data-testid="confidence-dot"
        className="inline-block w-2.5 h-2.5 rounded-[var(--radius-full)]"
        style={{ backgroundColor: color }}
        aria-label={`Confidence: ${label}`}
      />
      <span data-testid="confidence-badge">
        <Badge
          variant={confidenceBadgeVariant(confidence as "high" | "medium" | "low" | "none")}
          size="sm"
        >
          {label}
        </Badge>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Format helpers (local to this component)
   -------------------------------------------------------------------------- */

function formatHours(hours: number): string {
  if (hours < 0.01) return "< 1 min";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function formatDiskGb(gb: number): string {
  if (gb < 0.01) return "< 10 MB";
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(2)} GB`;
}

/* --------------------------------------------------------------------------
   Per-scene breakdown
   -------------------------------------------------------------------------- */

function SceneBreakdown({ estimate }: { estimate: BatchEstimate }) {
  return (
    <div data-testid="scene-breakdown" className="mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border-default)]">
            <th className="text-left py-1 font-medium">Scene</th>
            <th className="text-right py-1 font-medium">Segments</th>
            <th className="text-right py-1 font-medium">GPU</th>
            <th className="text-right py-1 font-medium">Disk</th>
            <th className="text-right py-1 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {estimate.scene_estimates.map((scene, idx) => (
            <tr
              key={idx}
              className="border-b border-[var(--color-border-default)] last:border-b-0"
            >
              <td className="py-1 text-[var(--color-text-primary)]">
                #{idx + 1}
              </td>
              <td className="py-1 text-right tabular-nums text-[var(--color-text-secondary)]">
                {scene.segments_needed}
              </td>
              <td className="py-1 text-right tabular-nums text-[var(--color-text-secondary)]">
                {formatHours(scene.gpu_seconds / SECS_PER_HOUR)}
              </td>
              <td className="py-1 text-right tabular-nums text-[var(--color-text-secondary)]">
                {formatDiskGb(scene.disk_mb / MB_PER_GB)}
              </td>
              <td className="py-1 text-right">
                <Badge
                  variant={confidenceBadgeVariant(scene.confidence)}
                  size="sm"
                >
                  {scene.confidence}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function EstimationCard({ estimate }: EstimationCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!estimate || estimate.confidence === "none") {
    return (
      <div data-testid="estimation-card-empty">
        <Card elevation="flat">
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              No estimate available. Calibration data is needed to generate
              resource estimates.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="estimation-card">
    <Card elevation="flat">
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Resource Estimate
          </span>
          <ConfidenceIndicator confidence={estimate.confidence} />
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="GPU Hours" value={formatHours(estimate.total_gpu_hours)} />
          <Stat
            label="Wall Clock"
            value={`${formatHours(estimate.wall_clock_hours)} (${estimate.worker_count}w)`}
          />
          <Stat label="Disk Space" value={formatDiskGb(estimate.total_disk_gb)} />
          <Stat label="Scenes" value={String(estimate.total_scenes)} />
        </div>

        {estimate.scene_estimates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border-default)]">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label="Toggle per-scene breakdown"
              className={cn(
                "text-xs text-[var(--color-text-secondary)]",
                "hover:text-[var(--color-text-primary)] transition-colors",
              )}
            >
              {expanded ? "Hide" : "Show"} per-scene breakdown ({estimate.total_scenes} scenes)
            </button>

            {expanded && <SceneBreakdown estimate={estimate} />}
          </div>
        )}
      </CardBody>
    </Card>
    </div>
  );
}
