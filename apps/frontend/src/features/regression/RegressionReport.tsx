/**
 * Regression report for a specific run (PRD-65).
 *
 * Shows a summary bar with verdict counts, overall pass/fail indicator,
 * and detailed result rows with score diffs.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";

import { useRunReport } from "./hooks/use-regression";
import { ScoreDiffDisplay } from "./ScoreDiffDisplay";
import { VerdictBadge } from "./VerdictBadge";
import type { RegressionResult, RunReportSummary } from "./types";

/* --------------------------------------------------------------------------
   Summary bar
   -------------------------------------------------------------------------- */

function SummaryBar({ summary }: { summary: RunReportSummary }) {
  return (
    <div data-testid="report-summary" className="flex items-center gap-3 text-sm flex-wrap">
      <span className="text-[var(--color-text-secondary)]">
        {summary.total} results:
      </span>
      {summary.improved > 0 && (
        <span className="text-[var(--color-action-success)]">
          {summary.improved} improved
        </span>
      )}
      {summary.same > 0 && (
        <span className="text-[var(--color-text-muted)]">
          {summary.same} unchanged
        </span>
      )}
      {summary.degraded > 0 && (
        <span className="text-[var(--color-action-danger)]">
          {summary.degraded} degraded
        </span>
      )}
      {summary.errors > 0 && (
        <span className="text-[var(--color-action-warning)]">
          {summary.errors} errors
        </span>
      )}
      <Badge
        variant={summary.overall_passed ? "success" : "danger"}
        size="sm"
      >
        {summary.overall_passed ? "PASSED" : "FAILED"}
      </Badge>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Result row
   -------------------------------------------------------------------------- */

function ResultRow({ result }: { result: RegressionResult }) {
  return (
    <div
      data-testid={`result-row-${result.id}`}
      className={cn(
        "px-3 py-3 border-b border-[var(--color-border-default)] last:border-b-0",
        "space-y-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <VerdictBadge verdict={result.verdict} />
          <span className="text-[var(--color-text-secondary)]">
            Reference #{result.reference_id}
          </span>
          {result.new_scene_id && (
            <span className="text-[var(--color-text-muted)]">
              Scene #{result.new_scene_id}
            </span>
          )}
        </div>
        {result.verdict === "degraded" && (
          <Button
            variant="secondary"
            size="sm"
            disabled
            data-testid={`rollback-btn-${result.id}`}
          >
            Rollback
          </Button>
        )}
      </div>

      {result.error_message && (
        <p className="text-xs text-[var(--color-action-danger)]">
          {result.error_message}
        </p>
      )}

      {Object.keys(result.baseline_scores).length > 0 && (
        <ScoreDiffDisplay
          baselineScores={result.baseline_scores}
          newScores={result.new_scores}
          scoreDiffs={result.score_diffs}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface RegressionReportProps {
  runId: number;
}

export function RegressionReport({ runId }: RegressionReportProps) {
  const { data: report, isLoading } = useRunReport(runId);

  if (isLoading) {
    return (
      <div data-testid="regression-report">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Loading report...
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div data-testid="regression-report">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Report not found.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="regression-report">
      <Card>
        <CardHeader>
          <SummaryBar summary={report.summary} />
        </CardHeader>
        <CardBody className="p-0">
          {report.results.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
