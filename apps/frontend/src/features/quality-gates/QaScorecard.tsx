/**
 * QA Scorecard — displays per-segment quality scores (PRD-49).
 *
 * Shows a compact card per check type with traffic light indicator,
 * numeric score, pass/warn/fail badge, and expandable details.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";

import type { QualityScore } from "./types";
import { CHECK_TYPE_LABELS, statusBadgeVariant, statusColor } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QaScorecardProps {
  scores: QualityScore[];
}

/* --------------------------------------------------------------------------
   Traffic light indicator
   -------------------------------------------------------------------------- */

function TrafficLight({ status }: { status: string }) {
  return (
    <span
      data-testid={`traffic-light-${status}`}
      className="inline-block w-3 h-3 rounded-[var(--radius-full)]"
      style={{ backgroundColor: statusColor(status) }}
      aria-label={`Status: ${status}`}
    />
  );
}

/* --------------------------------------------------------------------------
   Score row (expandable)
   -------------------------------------------------------------------------- */

function ScoreRow({ score }: { score: QualityScore }) {
  const [expanded, setExpanded] = useState(false);
  const label = CHECK_TYPE_LABELS[score.check_type] ?? score.check_type;

  return (
    <div
      data-testid={`score-row-${score.check_type}`}
      className="border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${label}`}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2",
          "hover:bg-[var(--color-surface-tertiary)] transition-colors",
          "text-left text-sm",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <TrafficLight status={score.status} />
          <span className="text-[var(--color-text-primary)] font-medium truncate">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid={`score-value-${score.check_type}`}
            className="text-[var(--color-text-secondary)] tabular-nums text-sm"
          >
            {score.score.toFixed(2)}
          </span>
          <Badge variant={statusBadgeVariant(score.status)} size="sm">
            {score.status}
          </Badge>
        </div>
      </button>

      {expanded && score.details && (
        <div
          data-testid={`score-details-${score.check_type}`}
          className="px-3 py-2 bg-[var(--color-surface-tertiary)] text-xs text-[var(--color-text-secondary)]"
        >
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(score.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Summary bar
   -------------------------------------------------------------------------- */

function SummaryBar({ scores }: { scores: QualityScore[] }) {
  const passed = scores.filter((s) => s.status === "pass").length;
  const warned = scores.filter((s) => s.status === "warn").length;
  const failed = scores.filter((s) => s.status === "fail").length;

  return (
    <div data-testid="qa-summary" className="flex items-center gap-3 text-sm">
      <span className="text-[var(--color-text-secondary)]">
        {scores.length} checks:
      </span>
      {passed > 0 && (
        <span className="text-[var(--color-action-success)]">{passed} passed</span>
      )}
      {warned > 0 && (
        <span className="text-[var(--color-action-warning)]">{warned} warned</span>
      )}
      {failed > 0 && (
        <span className="text-[var(--color-action-danger)]">{failed} failed</span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function QaScorecard({ scores }: QaScorecardProps) {
  if (scores.length === 0) {
    return (
      <Card elevation="flat">
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No QA scores available.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card data-testid="qa-scorecard" elevation="flat">
      <CardHeader>
        <SummaryBar scores={scores} />
      </CardHeader>
      <CardBody className="p-0">
        {scores.map((score) => (
          <ScoreRow key={score.id} score={score} />
        ))}
      </CardBody>
    </Card>
  );
}
