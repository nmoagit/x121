/**
 * Pre-export validation report component (PRD-39).
 *
 * Displays validation results in a terminal-style log viewer matching
 * the generation log style (dark background, monospace LogLine entries).
 */

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components";
import { LogLine } from "@/components/domain";
import { ChevronDown, ChevronRight, ShieldCheck, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { deliveryKeys, useDeliveryValidation } from "./hooks/use-delivery";
import type { DeliveryValidationResponse } from "./types";

/** Human-readable labels for validation categories. */
const CATEGORY_LABELS: Record<string, string> = {
  missing_avatars: "No Models",
  missing_final_video: "Missing Video",
  non_h264_codec: "Codec Warning",
  no_scenes: "No Scenes",
  metadata_not_approved: "Metadata",
  skipped_metadata: "Skipped",
  skipped_images: "Skipped",
  skipped_scenes: "Skipped",
  skipped_speech: "Skipped",
};

function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ValidationReportProps {
  projectId: number;
  /** Pre-loaded validation data (for testing or SSR). */
  initialData?: DeliveryValidationResponse;
  /** When provided, only these models are validated. Null/undefined = all. */
  avatarIds?: number[] | null;
}

export function ValidationReport({ projectId, initialData, avatarIds }: ValidationReportProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cleared, setCleared] = useState(false);
  const { data, isLoading, isError, error, refetch } = useDeliveryValidation(projectId, enabled, avatarIds);

  const result = cleared ? undefined : (data ?? initialData);
  const hasResult = result != null;

  function handleRunValidation() {
    setCleared(false);
    setCollapsed(false);
    if (enabled) {
      refetch();
    } else {
      setEnabled(true);
    }
  }

  function handleClear() {
    setCleared(true);
    setCollapsed(true);
    setEnabled(false);
    queryClient.removeQueries({ queryKey: deliveryKeys.validation(projectId) });
  }

  return (
    <div data-testid="validation-report" className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden">
      {/* Terminal header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => hasResult && setCollapsed((v) => !v)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && hasResult) setCollapsed((v) => !v); }}
        className="flex w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-tertiary)] border-b border-[var(--color-border-default)] cursor-pointer hover:bg-[var(--color-surface-secondary)] transition-colors"
      >
        {hasResult ? (
          collapsed ? (
            <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
          )
        ) : (
          <ShieldCheck size={14} className="text-[var(--color-text-muted)]" />
        )}
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Delivery Validation
        </span>

        {/* Summary badge inline in header */}
        {result && (
          <span className={`font-mono text-[10px] font-bold tracking-wider ${result.passed ? "text-emerald-400" : "text-red-400"}`}>
            [{result.passed ? "PASS" : "FAIL"}]
          </span>
        )}
        {result && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {result.error_count} error{result.error_count !== 1 ? "s" : ""},
            {" "}{result.warning_count} warning{result.warning_count !== 1 ? "s" : ""}
          </span>
        )}

        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <span className="ml-auto flex items-center gap-[var(--spacing-2)]" onClick={(e) => e.stopPropagation()}>
          <Button
            variant={hasResult ? "ghost" : "secondary"}
            size="sm"
            onClick={handleRunValidation}
            disabled={isLoading}
          >
            {isLoading ? "Validating..." : "Run Validation"}
          </Button>
          {hasResult && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </span>
      </div>

      {/* Log output area */}
      {!collapsed && hasResult && (
        <div className="max-h-64 overflow-y-auto bg-[#0d1117] p-[var(--spacing-3)]">
          {isError && (
            <p className="text-xs font-mono text-[var(--color-action-danger)]">
              Validation query failed: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          )}

          {result.issues.length > 0 ? (
            <div className="flex flex-col gap-px">
              {result.issues.map((issue, idx) => (
                <LogLine
                  key={idx}
                  timestamp={new Date().toISOString()}
                  level={issue.severity === "error" ? "error" : issue.severity === "info" ? "info" : "warn"}
                  message={`[${formatCategory(issue.category)}] ${issue.message}`}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-action-success)] font-mono">
              All checks passed — ready to export.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
