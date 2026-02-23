/**
 * SegmentVersionComparison — side-by-side old vs. new segment display (PRD-25).
 *
 * Shows version history for a segment position with stale indicators,
 * regeneration count, and boundary SSIM comparison.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import type { SegmentVersionInfo } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SegmentVersionComparisonProps {
  versions: SegmentVersionInfo[];
}

/* --------------------------------------------------------------------------
   Version row
   -------------------------------------------------------------------------- */

function VersionRow({
  version,
  isCurrent,
}: {
  version: SegmentVersionInfo;
  isCurrent: boolean;
}) {
  return (
    <div
      data-testid={`version-row-${version.id}`}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2",
        "border-b border-[var(--color-border-default)] last:border-b-0",
        isCurrent && "bg-[var(--color-surface-secondary)]",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          v{version.regeneration_count}
        </span>
        {isCurrent && (
          <Badge variant="success" size="sm">
            current
          </Badge>
        )}
        {version.is_stale && (
          <Badge variant="warning" size="sm">
            stale
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 text-sm text-[var(--color-text-secondary)]">
        {version.boundary_ssim_before !== null && (
          <span className="tabular-nums">
            SSIM-B: {version.boundary_ssim_before.toFixed(3)}
          </span>
        )}
        {version.boundary_ssim_after !== null && (
          <span className="tabular-nums">
            SSIM-A: {version.boundary_ssim_after.toFixed(3)}
          </span>
        )}
        <span>{formatDateTime(version.created_at)}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SegmentVersionComparison({
  versions,
}: SegmentVersionComparisonProps) {
  if (versions.length === 0) {
    return (
      <Card elevation="flat">
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No version history available.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card data-testid="segment-version-comparison" elevation="flat">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Version History
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {versions.length} version{versions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {versions.map((version, index) => (
          <VersionRow
            key={version.id}
            version={version}
            isCurrent={index === 0}
          />
        ))}
      </CardBody>
    </Card>
  );
}
