/**
 * Pattern detail component (PRD-64).
 *
 * Shows a failure pattern info card with dimensions, rates, severity badge,
 * a list of recorded fixes with effectiveness ratings, and a form to add
 * new fixes.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { formatDateTime } from "@/lib/format";

import {
  useCreateFix,
  usePatternFixes,
} from "./hooks/use-failure-analytics";
import type { FailurePattern } from "./types";
import { severityBadgeVariant } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface PatternDetailProps {
  pattern: FailurePattern;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PatternDetail({ pattern }: PatternDetailProps) {
  const { data: fixes, isPending: fixesLoading } = usePatternFixes(pattern.id);
  const createFix = useCreateFix(pattern.id);

  const [fixDescription, setFixDescription] = useState("");

  const handleSubmitFix = () => {
    if (!fixDescription.trim()) return;
    createFix.mutate(
      { fix_description: fixDescription.trim() },
      {
        onSuccess: () => setFixDescription(""),
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="pattern-detail">
      {/* Pattern info card */}
      <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-surface-secondary)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
            Pattern #{pattern.id}
          </h3>
          <Badge variant={severityBadgeVariant(pattern.severity)}>
            {pattern.severity}
          </Badge>
        </div>

        {pattern.description && (
          <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
            {pattern.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-[var(--color-text-muted)]">Failure Rate</div>
          <div
            className="font-mono text-[var(--color-text-primary)]"
            data-testid="failure-rate"
          >
            {(pattern.failure_rate * 100).toFixed(1)}%
          </div>

          <div className="text-[var(--color-text-muted)]">
            Failures / Total
          </div>
          <div className="text-[var(--color-text-primary)]">
            {pattern.failure_count} / {pattern.total_count}
          </div>

          {pattern.dimension_workflow_id && (
            <>
              <div className="text-[var(--color-text-muted)]">Workflow</div>
              <div className="text-[var(--color-text-primary)]">
                #{pattern.dimension_workflow_id}
              </div>
            </>
          )}

          {pattern.dimension_character_id && (
            <>
              <div className="text-[var(--color-text-muted)]">Character</div>
              <div className="text-[var(--color-text-primary)]">
                #{pattern.dimension_character_id}
              </div>
            </>
          )}

          {pattern.dimension_scene_type_id && (
            <>
              <div className="text-[var(--color-text-muted)]">Scene Type</div>
              <div className="text-[var(--color-text-primary)]">
                #{pattern.dimension_scene_type_id}
              </div>
            </>
          )}

          {pattern.dimension_lora_id && (
            <>
              <div className="text-[var(--color-text-muted)]">LoRA</div>
              <div className="text-[var(--color-text-primary)]">
                #{pattern.dimension_lora_id}
              </div>
            </>
          )}

          {pattern.dimension_segment_position && (
            <>
              <div className="text-[var(--color-text-muted)]">
                Segment Position
              </div>
              <div className="text-[var(--color-text-primary)]">
                {pattern.dimension_segment_position}
              </div>
            </>
          )}

          {pattern.last_occurrence && (
            <>
              <div className="text-[var(--color-text-muted)]">
                Last Occurrence
              </div>
              <div className="text-[var(--color-text-primary)]">
                {formatDateTime(pattern.last_occurrence)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fixes list */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
          Recorded Fixes
        </h4>

        {fixesLoading && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading fixes...
          </p>
        )}

        {fixes && fixes.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">
            No fixes recorded yet.
          </p>
        )}

        {fixes && fixes.length > 0 && (
          <ul className="space-y-2" data-testid="fixes-list">
            {fixes.map((fix) => (
              <li
                key={fix.id}
                className="rounded border border-[var(--color-border-primary)] bg-[var(--color-surface-primary)] p-3"
              >
                <p className="text-sm text-[var(--color-text-primary)]">
                  {fix.fix_description}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <span>{formatDateTime(fix.created_at)}</span>
                  {fix.effectiveness && (
                    <Badge
                      variant={effectivenessBadgeVariant(fix.effectiveness)}
                      size="sm"
                    >
                      {fix.effectiveness}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add fix form */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
          Record a Fix
        </h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={fixDescription}
            onChange={(e) => setFixDescription(e.target.value)}
            placeholder="Describe the fix..."
            className="flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
            data-testid="fix-description-input"
          />
          <button
            type="button"
            onClick={handleSubmitFix}
            disabled={!fixDescription.trim() || createFix.isPending}
            className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-action-primary)]/80 disabled:opacity-50"
            data-testid="submit-fix-button"
          >
            {createFix.isPending ? "Saving..." : "Add Fix"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function effectivenessBadgeVariant(
  effectiveness: string,
): "success" | "warning" | "danger" | "default" {
  switch (effectiveness) {
    case "resolved":
      return "success";
    case "improved":
      return "warning";
    case "no_effect":
      return "danger";
    default:
      return "default";
  }
}
