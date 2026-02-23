/**
 * Worker Health Dashboard — grid of worker cards with health status (PRD-43).
 *
 * Each card shows a traffic-light health indicator, per-category breakdown
 * (models found/missing/corrupted, nodes found/missing), and scan/repair buttons.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import type { IntegrityScan } from "./types";
import {
  HEALTH_STATUS_COLORS,
  SCAN_TYPE_LABELS,
  healthBadgeVariant,
} from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkerCardProps {
  workerId: number;
  workerName: string;
  latestScan: IntegrityScan | null;
  healthStatus: string;
  onStartScan: (workerId: number, scanType: string) => void;
  onRepair: (workerId: number) => void;
}

interface WorkerHealthDashboardProps {
  workers: WorkerCardProps[];
}

/* --------------------------------------------------------------------------
   Traffic-light indicator
   -------------------------------------------------------------------------- */

function HealthIndicator({ status }: { status: string }) {
  return (
    <span
      data-testid={`health-indicator-${status}`}
      className="inline-block w-3 h-3 rounded-[var(--radius-full)]"
      style={{
        backgroundColor:
          HEALTH_STATUS_COLORS[status] ?? "var(--color-text-muted)",
      }}
      aria-label={`Health: ${status}`}
    />
  );
}

/* --------------------------------------------------------------------------
   Category breakdown
   -------------------------------------------------------------------------- */

function CategoryBreakdown({ scan }: { scan: IntegrityScan }) {
  return (
    <div data-testid="category-breakdown" className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-[var(--color-text-secondary)]">Models found</span>
        <span data-testid="models-found" className="tabular-nums">{scan.models_found}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--color-text-secondary)]">Models missing</span>
        <span data-testid="models-missing" className="tabular-nums">{scan.models_missing}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--color-text-secondary)]">Models corrupted</span>
        <span data-testid="models-corrupted" className="tabular-nums">{scan.models_corrupted}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--color-text-secondary)]">Nodes found</span>
        <span data-testid="nodes-found" className="tabular-nums">{scan.nodes_found}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--color-text-secondary)]">Nodes missing</span>
        <span data-testid="nodes-missing" className="tabular-nums">{scan.nodes_missing}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Worker card
   -------------------------------------------------------------------------- */

function WorkerCard({
  workerId,
  workerName,
  latestScan,
  healthStatus,
  onStartScan,
  onRepair,
}: WorkerCardProps) {
  const scanLabel = latestScan
    ? SCAN_TYPE_LABELS[latestScan.scan_type] ?? latestScan.scan_type
    : "No scans yet";

  return (
    <div data-testid={`worker-card-${workerId}`}>
    <Card elevation="flat">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HealthIndicator status={healthStatus} />
            <span className="font-medium text-[var(--color-text-primary)]">
              {workerName}
            </span>
          </div>
          <Badge variant={healthBadgeVariant(healthStatus)} size="sm">
            {healthStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {latestScan ? (
          <>
            <p className="text-xs text-[var(--color-text-muted)]">
              Last scan: {scanLabel}
            </p>
            <CategoryBreakdown scan={latestScan} />
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            No scan data available.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            data-testid={`scan-btn-${workerId}`}
            onClick={() => onStartScan(workerId, "full")}
            className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Run Scan
          </button>
          <button
            type="button"
            data-testid={`repair-btn-${workerId}`}
            onClick={() => onRepair(workerId)}
            className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-action-danger)] text-white hover:opacity-90 transition-opacity"
          >
            Repair
          </button>
        </div>
      </CardBody>
    </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function WorkerHealthDashboard({ workers }: WorkerHealthDashboardProps) {
  if (workers.length === 0) {
    return (
      <Card elevation="flat">
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No workers available.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div
      data-testid="worker-health-dashboard"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {workers.map((worker) => (
        <WorkerCard key={worker.workerId} {...worker} />
      ))}
    </div>
  );
}
