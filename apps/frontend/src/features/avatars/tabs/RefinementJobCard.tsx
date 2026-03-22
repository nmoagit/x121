/**
 * Card displaying a single LLM refinement job with status and actions.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite";
import { Badge, Button } from "@/components/primitives";
import { useSetToggle } from "@/hooks/useSetToggle";
import { formatDate } from "@/lib/format";
import { Check, Eye, X } from "@/tokens/icons";

import type { RefinementJob } from "../types";
import { MetadataDiffView } from "./MetadataDiffView";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_VARIANT = {
  queued: "default",
  running: "info",
  completed: "success",
  failed: "danger",
} as const;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface RefinementJobCardProps {
  job: RefinementJob;
  currentMetadata: Record<string, unknown>;
  onApprove: (selectedFields?: string[]) => void;
  onReject: (reason?: string) => void;
  onRetry?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RefinementJobCard({
  job,
  currentMetadata,
  onApprove,
  onReject,
  onRetry,
}: RefinementJobCardProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [selectedFields, handleToggleField] = useSetToggle<string>(
    job.final_report?.changes?.map((c) => c.field),
  );

  const handleApprove = useCallback(() => {
    const allFields = job.final_report?.changes?.map((c) => c.field) ?? [];
    const allSelected = allFields.length === selectedFields.size;
    onApprove(allSelected ? undefined : [...selectedFields]);
  }, [job.final_report, selectedFields, onApprove]);

  return (
    <Card elevation="flat" padding="sm">
      <div className="flex flex-col gap-[var(--spacing-2)]">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Badge variant={STATUS_VARIANT[job.status]} size="sm">
              {job.status}
            </Badge>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {job.llm_provider}/{job.llm_model}
            </span>
            {job.enrich && (
              <Badge variant="info" size="sm">enriched</Badge>
            )}
            {job.final_report && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {job.final_report.iterations_count} iteration{job.final_report.iterations_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {formatDate(job.created_at)}
          </span>
        </div>

        {/* Error message for failed jobs */}
        {job.status === "failed" && job.error && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-action-danger)]/5 px-2 py-1.5">
            <span className="text-xs text-[var(--color-action-danger)]">{job.error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-[var(--spacing-2)]">
          {job.status === "completed" && job.final_metadata && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Eye size={14} />}
              onClick={() => setShowDiff(!showDiff)}
            >
              {showDiff ? "Hide Diff" : "Review & Approve"}
            </Button>
          )}
          {job.status === "failed" && onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>

        {/* Diff view */}
        {showDiff && job.final_metadata && (
          <div className="border-t border-[var(--color-border-default)] pt-[var(--spacing-2)]">
            <MetadataDiffView
              currentMetadata={currentMetadata}
              refinedMetadata={job.final_metadata}
              report={job.final_report}
              selectedFields={selectedFields}
              onToggleField={handleToggleField}
            />
            <div className="flex items-center justify-end gap-[var(--spacing-2)] pt-[var(--spacing-3)]">
              <Button
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={() => onReject()}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Check size={14} />}
                onClick={handleApprove}
                disabled={selectedFields.size === 0}
              >
                Approve{selectedFields.size > 0 ? ` (${selectedFields.size} fields)` : ""}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
