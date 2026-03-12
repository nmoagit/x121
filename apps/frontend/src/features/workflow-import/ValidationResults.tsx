/**
 * Workflow validation results display component (PRD-75).
 *
 * Shows per-node and per-model validation status with an overall
 * pass/fail summary badge.
 */

import { Badge } from "@/components/primitives";

import { useValidationReport } from "./hooks/use-workflow-import";
import type { ValidationResult } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ValidationResultsProps {
  /** Workflow ID to fetch validation results for. */
  workflowId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ValidationResults({ workflowId }: ValidationResultsProps) {
  const { data: report, isLoading } = useValidationReport(workflowId);

  if (isLoading) {
    return (
      <div data-testid="validation-loading" className="text-sm text-[var(--color-text-tertiary)]">
        Loading validation results...
      </div>
    );
  }

  if (!report) {
    return (
      <div data-testid="validation-empty" className="text-sm text-[var(--color-text-tertiary)]">
        No validation results available. Run validation to check this workflow.
      </div>
    );
  }

  const validation = report as ValidationResult;

  return (
    <div data-testid="validation-results" className="space-y-4">
      {/* Overall summary */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Overall Status:</span>
        {validation.validation_source === "live" ? (
          <Badge
            data-testid="overall-badge"
            variant={validation.overall_valid ? "success" : "danger"}
          >
            {validation.overall_valid ? "Pass" : "Fail"}
          </Badge>
        ) : (
          <Badge data-testid="overall-badge" variant="warning">
            Unverified
          </Badge>
        )}
        <Badge
          data-testid="source-badge"
          variant={validation.validation_source === "live" ? "info" : "warning"}
        >
          {validation.validation_source === "live"
            ? "Validated against ComfyUI"
            : "Connect ComfyUI to verify"}
        </Badge>
      </div>

      {/* Node results */}
      {validation.node_results.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
            Node Types ({validation.node_results.length})
          </h4>
          <div className="space-y-1">
            {validation.node_results.map((nr) => {
              const isLive = validation.validation_source === "live";
              let icon: string;
              let colorClass: string;

              if (isLive) {
                icon = nr.present ? "\u2713" : "\u2717";
                colorClass = nr.present
                  ? "text-[var(--color-action-success)]"
                  : "text-[var(--color-action-danger)]";
              } else {
                icon = "\u2014";
                colorClass = "text-[var(--color-text-muted)]";
              }

              return (
                <div
                  key={nr.node_type}
                  data-testid={`node-${nr.node_type}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className={colorClass}>{icon}</span>
                  <span>{nr.node_type}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model results */}
      {validation.model_results.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
            Models ({validation.model_results.length})
          </h4>
          <div className="space-y-1">
            {validation.model_results.map((mr) => (
              <div
                key={mr.model_name}
                data-testid={`model-${mr.model_name}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={
                    mr.found_in_registry
                      ? "text-[var(--color-action-success)]"
                      : "text-[var(--color-action-warning)]"
                  }
                >
                  {mr.found_in_registry ? "\u2713" : "?"}
                </span>
                <span>{mr.model_name}</span>
                {!mr.found_in_registry && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    (requires worker verification)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
