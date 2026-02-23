/**
 * Staleness report component (PRD-69).
 *
 * Lists segments whose generation receipts reference outdated
 * model versions compared to the current asset versions.
 */

import { Badge, Spinner } from "@/components";
import { Card, CardBody, CardHeader } from "@/components";

import { useStalenessReport } from "./hooks/use-provenance";
import type { StalenessReportEntry } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface StalenessReportProps {
  projectId?: number;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function StaleEntryRow({ entry }: { entry: StalenessReportEntry }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2"
      data-testid={`stale-entry-${entry.receipt_id}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-[var(--color-text-primary)]">
          Segment #{entry.segment_id}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Scene #{entry.scene_id} | Receipt #{entry.receipt_id}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs text-[var(--color-text-muted)]">
          Receipt: <span className="font-mono">{entry.model_version}</span>
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Current:{" "}
          <span className="font-mono">
            {entry.current_model_version ?? "removed"}
          </span>
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StalenessReport({ projectId }: StalenessReportProps) {
  const { data: entries, isLoading, isError } = useStalenessReport(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6" data-testid="staleness-loading">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="p-4 text-sm text-[var(--color-action-danger)]"
        data-testid="staleness-error"
      >
        Failed to load staleness report.
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div
        className="p-4 text-sm text-[var(--color-text-muted)] text-center"
        data-testid="staleness-empty"
      >
        No stale segments found. All receipts are up to date.
      </div>
    );
  }

  return (
    <Card data-testid="staleness-report">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Staleness Report
          </h3>
          <Badge variant="warning" size="sm">
            {entries.length} stale
          </Badge>
        </div>
      </CardHeader>
      <CardBody>
        <div
          className="divide-y divide-[var(--color-border-default)]"
          data-testid="staleness-list"
        >
          {entries.map((entry) => (
            <StaleEntryRow key={entry.receipt_id} entry={entry} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
