/**
 * Version history panel for wiki articles (PRD-56).
 *
 * Lists all versions with editor, date, and summary. Supports selecting
 * two versions to diff and reverting to a previous version.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { formatDateTime } from "@/lib/format";

import type { DiffLine, WikiVersion } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WikiVersionHistoryProps {
  /** All versions of the article, ordered newest first. */
  versions: WikiVersion[];
  /** Diff lines between two selected versions. */
  diffLines?: DiffLine[];
  /** Called when the user selects two versions to diff. */
  onDiffSelect?: (v1: number, v2: number) => void;
  /** Called when the user wants to revert to a version. */
  onRevert?: (version: number) => void;
  /** Whether a revert is currently in progress. */
  isReverting?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WikiVersionHistory({
  versions,
  diffLines,
  onDiffSelect,
  onRevert,
  isReverting = false,
}: WikiVersionHistoryProps) {
  const [selectedV1, setSelectedV1] = useState<number | null>(null);
  const [selectedV2, setSelectedV2] = useState<number | null>(null);

  const handleVersionSelect = (version: number) => {
    if (selectedV1 === null) {
      setSelectedV1(version);
    } else if (selectedV2 === null && version !== selectedV1) {
      setSelectedV2(version);
      if (onDiffSelect) {
        const v1 = Math.min(selectedV1, version);
        const v2 = Math.max(selectedV1, version);
        onDiffSelect(v1, v2);
      }
    } else {
      // Reset and start new selection.
      setSelectedV1(version);
      setSelectedV2(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="wiki-version-history">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Version History
      </h3>

      {/* Instructions */}
      {onDiffSelect && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Select two versions to compare.
          {selectedV1 !== null && selectedV2 === null && (
            <> Version {selectedV1} selected. Pick a second version.</>
          )}
        </p>
      )}

      {/* Version list */}
      <div className="flex flex-col gap-2" data-testid="wiki-version-list">
        {versions.map((v) => {
          const isSelected = v.version === selectedV1 || v.version === selectedV2;
          return (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                isSelected
                  ? "border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]"
                  : "border-[var(--color-border-default)]"
              }`}
              data-testid={`wiki-version-${v.version}`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">
                    v{v.version}
                  </Badge>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {formatDateTime(v.created_at)}
                  </span>
                  {v.edited_by != null && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      by User #{v.edited_by}
                    </span>
                  )}
                </div>
                {v.edit_summary && (
                  <span
                    className="text-xs text-[var(--color-text-muted)]"
                    data-testid={`wiki-version-summary-${v.version}`}
                  >
                    {v.edit_summary}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onDiffSelect && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleVersionSelect(v.version)}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </Button>
                )}
                {onRevert && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onRevert(v.version)}
                    disabled={isReverting}
                    data-testid={`wiki-revert-${v.version}`}
                  >
                    Revert
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Diff display */}
      {diffLines && diffLines.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="wiki-diff-display">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
            Diff: v{selectedV1} vs v{selectedV2}
          </h4>
          <div className="overflow-x-auto rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-2 font-mono text-xs">
            {diffLines.map((line, idx) => {
              let bgClass = "";
              let prefix = " ";
              if (line.line_type === "added") {
                bgClass = "bg-green-900/20 text-green-400";
                prefix = "+";
              } else if (line.line_type === "removed") {
                bgClass = "bg-red-900/20 text-red-400";
                prefix = "-";
              }
              return (
                <div
                  key={idx}
                  className={`px-2 py-0.5 ${bgClass}`}
                  data-testid={`wiki-diff-line-${idx}`}
                >
                  {prefix} {line.content}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
