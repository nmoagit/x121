/**
 * Scan History — chronological list of integrity scans (PRD-43).
 *
 * Shows a list of past scans with summary counts, scan type, status,
 * and timestamps.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { formatDateTime } from "@/lib/format";

import type { IntegrityScan } from "./types";
import { SCAN_TYPE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ScanHistoryProps {
  scans: IntegrityScan[];
}

/* --------------------------------------------------------------------------
   Status label helpers
   -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Running",
  3: "Completed",
  4: "Failed",
  5: "Cancelled",
};

function statusBadgeVariant(
  statusId: number,
): "success" | "warning" | "danger" | "default" {
  switch (statusId) {
    case 3:
      return "success";
    case 2:
      return "warning";
    case 4:
    case 5:
      return "danger";
    default:
      return "default";
  }
}

/* --------------------------------------------------------------------------
   Summary counts
   -------------------------------------------------------------------------- */

function SummaryCounts({ scan }: { scan: IntegrityScan }) {
  return (
    <div data-testid={`scan-summary-${scan.id}`} className="flex gap-3 text-xs text-[var(--color-text-secondary)]">
      <span>{scan.models_found} found</span>
      {scan.models_missing > 0 && (
        <span className="text-[var(--color-action-warning)]">
          {scan.models_missing} missing
        </span>
      )}
      {scan.models_corrupted > 0 && (
        <span className="text-[var(--color-action-danger)]">
          {scan.models_corrupted} corrupted
        </span>
      )}
      {scan.nodes_missing > 0 && (
        <span className="text-[var(--color-action-warning)]">
          {scan.nodes_missing} nodes missing
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Scan row
   -------------------------------------------------------------------------- */

function ScanRow({ scan }: { scan: IntegrityScan }) {
  const typeLabel = SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type;
  const statusLabel = STATUS_LABELS[scan.status_id] ?? `Status ${scan.status_id}`;
  const startedAt = scan.started_at
    ? formatDateTime(scan.started_at)
    : "Not started";

  return (
    <div
      data-testid={`scan-row-${scan.id}`}
      className="flex items-center justify-between gap-4 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {typeLabel}
          </span>
          <Badge variant={statusBadgeVariant(scan.status_id)} size="sm">
            {statusLabel}
          </Badge>
        </div>
        <SummaryCounts scan={scan} />
      </div>
      <div className="text-xs text-[var(--color-text-muted)] shrink-0 tabular-nums">
        {startedAt}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ScanHistory({ scans }: ScanHistoryProps) {
  if (scans.length === 0) {
    return (
      <Card elevation="flat">
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No scan history available.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div data-testid="scan-history">
    <Card elevation="flat">
      <CardHeader>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Scan History ({scans.length})
        </span>
      </CardHeader>
      <CardBody className="p-0">
        {scans.map((scan) => (
          <ScanRow key={scan.id} scan={scan} />
        ))}
      </CardBody>
    </Card>
    </div>
  );
}
