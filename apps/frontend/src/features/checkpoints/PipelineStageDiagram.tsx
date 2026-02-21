/**
 * Pipeline stage diagram for checkpoint visualization (PRD-28).
 *
 * Displays a step-by-step pipeline diagram:
 * - Green checkmark for completed stages
 * - Red X for the failed stage (with expandable error summary)
 * - Grey circle for pending stages
 * - Prominent resume button on failed jobs
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { Check, XCircle, ChevronDown, ChevronRight } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Badge, Button } from "@/components/primitives";
import { Stack } from "@/components/layout";

import type { PipelineStage, FailureDiagnosticDetail } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface PipelineStageDiagramProps {
  /** Pipeline stages derived from checkpoints and failure info. */
  stages: PipelineStage[];
  /** Structured failure diagnostics (null if job did not fail). */
  diagnostics: FailureDiagnosticDetail | null;
  /** Whether the job is in a failed state and eligible for resume. */
  canResume: boolean;
  /** Callback when the user clicks "Resume from Checkpoint". */
  onResume?: () => void;
}

/* --------------------------------------------------------------------------
   Stage icon
   -------------------------------------------------------------------------- */

function StageIcon({ status }: { status: PipelineStage["status"] }) {
  switch (status) {
    case "completed":
      return (
        <div
          className={cn(
            "flex items-center justify-center",
            "w-6 h-6 rounded-[var(--radius-full)]",
            "bg-[var(--color-status-success)]",
          )}
          data-testid="stage-icon-completed"
        >
          <Check size={iconSizes.sm} className="text-white" />
        </div>
      );
    case "failed":
      return (
        <div
          className={cn(
            "flex items-center justify-center",
            "w-6 h-6 rounded-[var(--radius-full)]",
            "bg-[var(--color-status-error)]",
          )}
          data-testid="stage-icon-failed"
        >
          <XCircle size={iconSizes.sm} className="text-white" />
        </div>
      );
    case "pending":
    default:
      return (
        <div
          className={cn(
            "w-6 h-6 rounded-[var(--radius-full)]",
            "bg-[var(--color-surface-tertiary)]",
            "border-2 border-[var(--color-border-default)]",
          )}
          data-testid="stage-icon-pending"
        />
      );
  }
}

/* --------------------------------------------------------------------------
   Connector line between stages
   -------------------------------------------------------------------------- */

function StageConnector({ status }: { status: PipelineStage["status"] }) {
  const color =
    status === "completed"
      ? "bg-[var(--color-status-success)]"
      : "bg-[var(--color-border-default)]";

  return <div className={cn("w-0.5 h-6 ml-[11px]", color)} />;
}

/* --------------------------------------------------------------------------
   Failed stage error detail (expandable)
   -------------------------------------------------------------------------- */

function FailedStageDetail({
  diagnostics,
}: {
  diagnostics: FailureDiagnosticDetail;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "mt-1 ml-9",
        "bg-[var(--color-status-error)]/10",
        "border border-[var(--color-status-error)]/30",
        "rounded-[var(--radius-md)]",
        "px-3 py-2",
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-[var(--color-status-error)] font-medium w-full text-left"
        type="button"
      >
        {expanded ? (
          <ChevronDown size={iconSizes.sm} />
        ) : (
          <ChevronRight size={iconSizes.sm} />
        )}
        {diagnostics.error_message}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
          {diagnostics.comfyui_error && (
            <div>
              <span className="font-medium">ComfyUI:</span>{" "}
              {diagnostics.comfyui_error}
            </div>
          )}
          {diagnostics.node_id && (
            <div>
              <span className="font-medium">Node:</span> {diagnostics.node_id}
            </div>
          )}
          {diagnostics.gpu_memory_used_mb != null &&
            diagnostics.gpu_memory_total_mb != null && (
              <div>
                <span className="font-medium">GPU Memory:</span>{" "}
                {diagnostics.gpu_memory_used_mb} MB /{" "}
                {diagnostics.gpu_memory_total_mb} MB
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function PipelineStageDiagram({
  stages,
  diagnostics,
  canResume,
  onResume,
}: PipelineStageDiagramProps) {
  if (stages.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        No pipeline stages available
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-[var(--color-surface-secondary)]",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)]",
        "overflow-hidden",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-4 py-3",
          "border-b border-[var(--color-border-default)]",
          "bg-[var(--color-surface-primary)]/50",
        )}
      >
        <Stack direction="horizontal" gap={2} align="center" justify="between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Pipeline Progress
          </span>
          <Stack direction="horizontal" gap={2} align="center">
            <Badge variant="default" size="sm">
              {stages.filter((s) => s.status === "completed").length}/{stages.length} stages
            </Badge>
            {canResume && onResume && (
              <Button variant="primary" size="sm" onClick={onResume}>
                Resume from Checkpoint
              </Button>
            )}
          </Stack>
        </Stack>
      </div>

      {/* Stage list */}
      <div className="px-4 py-3">
        {stages.map((stage, idx) => (
          <div key={stage.index}>
            {/* Connector line (between stages, not before the first) */}
            {idx > 0 && (
              <StageConnector
                status={stages[idx - 1]!.status}
              />
            )}

            {/* Stage row */}
            <Stack direction="horizontal" gap={3} align="center">
              <StageIcon status={stage.status} />
              <Stack direction="vertical" gap={0}>
                <span
                  className={cn(
                    "text-sm font-medium",
                    stage.status === "completed" &&
                      "text-[var(--color-text-primary)]",
                    stage.status === "failed" &&
                      "text-[var(--color-status-error)]",
                    stage.status === "pending" &&
                      "text-[var(--color-text-muted)]",
                  )}
                >
                  {stage.name}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  Stage {stage.index + 1}
                </span>
              </Stack>
            </Stack>

            {/* Error detail for failed stage */}
            {stage.status === "failed" && diagnostics && (
              <FailedStageDetail diagnostics={diagnostics} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
