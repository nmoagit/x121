/**
 * Pre-export validation report component (PRD-39).
 *
 * Runs delivery validation on demand and displays pass/fail summary
 * with a list of errors and warnings.
 */

import { useState } from "react";

import { Badge, Button } from "@/components";
import { cn } from "@/lib/cn";

import { useDeliveryValidation } from "./hooks/use-delivery";
import { SEVERITY_COLORS } from "./types";
import type { DeliveryValidationResponse, ValidationIssue } from "./types";

interface ValidationReportProps {
  projectId: number;
  /** Pre-loaded validation data (for testing or SSR). */
  initialData?: DeliveryValidationResponse;
}

export function ValidationReport({ projectId, initialData }: ValidationReportProps) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading } = useDeliveryValidation(projectId, enabled);

  const result = data ?? initialData;

  function handleRunValidation() {
    setEnabled(true);
  }

  return (
    <div data-testid="validation-report" className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Delivery Validation
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRunValidation}
          disabled={isLoading}
          data-testid="run-validation-button"
        >
          {isLoading ? "Validating..." : "Run Validation"}
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div data-testid="validation-summary" className="flex items-center gap-3">
            <Badge variant={result.passed ? "success" : "danger"} size="md">
              {result.passed ? "PASS" : "FAIL"}
            </Badge>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {result.error_count} error{result.error_count !== 1 ? "s" : ""},
              {" "}{result.warning_count} warning{result.warning_count !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Issue list */}
          {result.issues.length > 0 && (
            <ul data-testid="validation-issues" className="space-y-2">
              {result.issues.map((issue, idx) => (
                <IssueItem key={idx} issue={issue} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IssueItem({ issue }: { issue: ValidationIssue }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-sm",
        "rounded-[var(--radius-md)] p-2",
        "bg-[var(--color-surface-secondary)]",
      )}
      data-testid="validation-issue"
    >
      <Badge variant={SEVERITY_COLORS[issue.severity]} size="sm">
        {issue.severity}
      </Badge>
      <div className="flex-1">
        <span className="text-[var(--color-text-secondary)]">[{issue.category}]</span>{" "}
        <span className="text-[var(--color-text-primary)]">{issue.message}</span>
        {issue.entity_id != null && (
          <span className="ml-1 text-xs text-[var(--color-text-muted)]">
            (ID: {issue.entity_id})
          </span>
        )}
      </div>
    </li>
  );
}
