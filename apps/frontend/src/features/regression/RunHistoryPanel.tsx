/**
 * Run history panel for regression testing (PRD-65).
 *
 * Displays a list of regression runs with status indicators,
 * progress bars, and a trigger button for manual runs.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import { useRegressionRuns, useTriggerRun } from "./hooks/use-regression";
import type { RegressionRun } from "./types";
import {
  RUN_STATUS_BADGE_VARIANT,
  RUN_STATUS_LABELS,
  TRIGGER_MANUAL,
} from "./types";

/* --------------------------------------------------------------------------
   Run row
   -------------------------------------------------------------------------- */

function RunRow({
  run,
  onViewReport,
}: {
  run: RegressionRun;
  onViewReport?: (runId: number) => void;
}) {
  const progress =
    run.total_references > 0
      ? Math.round((run.completed_count / run.total_references) * 100)
      : 0;

  return (
    <div
      data-testid={`run-row-${run.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={RUN_STATUS_BADGE_VARIANT[run.status]} size="sm">
            {RUN_STATUS_LABELS[run.status]}
          </Badge>
          <span className="text-[var(--color-text-secondary)]">
            {run.trigger_description ?? run.trigger_type}
          </span>
        </div>
        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Progress: {run.completed_count} / {run.total_references} ({progress}%)
          {run.status === "completed" && (
            <span className="ml-2">
              Passed: {run.passed_count} | Failed: {run.failed_count}
            </span>
          )}
        </div>
      </div>
      {run.status === "completed" && onViewReport && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewReport(run.id)}
          data-testid={`view-report-${run.id}`}
        >
          View Report
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface RunHistoryPanelProps {
  onViewReport?: (runId: number) => void;
}

export function RunHistoryPanel({ onViewReport }: RunHistoryPanelProps) {
  const { data: runs, isLoading } = useRegressionRuns();
  const triggerRun = useTriggerRun();

  function handleTrigger() {
    triggerRun.mutate({
      trigger_type: TRIGGER_MANUAL,
      trigger_description: "Manual regression run",
    });
  }

  if (isLoading) {
    return (
      <div data-testid="run-history-panel">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Loading runs...
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const list = runs ?? [];

  return (
    <div data-testid="run-history-panel">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Regression Runs
          </h3>
          <Button
            variant="primary"
            size="sm"
            onClick={handleTrigger}
            loading={triggerRun.isPending}
            data-testid="trigger-run-btn"
          >
            Trigger Run
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          {list.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              No regression runs yet. Trigger one to get started.
            </div>
          ) : (
            list.map((run) => (
              <RunRow key={run.id} run={run} onViewReport={onViewReport} />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
