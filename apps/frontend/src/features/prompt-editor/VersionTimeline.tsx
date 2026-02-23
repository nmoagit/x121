/**
 * Version timeline component (PRD-63).
 *
 * Displays a chronological list of prompt versions for a scene type.
 * Supports viewing version content, diffing two selected versions,
 * and restoring a previous version.
 */

import { useState } from "react";

import { Badge } from "@/components";
import { formatDateTime } from "@/lib/format";

import type { PromptVersion } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VersionTimelineProps {
  /** Scene type ID these versions belong to. */
  sceneTypeId: number;
  /** Array of prompt versions to display (newest first). */
  versions: PromptVersion[];
  /** Callback when the diff button is clicked with two selected version IDs. */
  onDiff?: (idA: number, idB: number) => void;
  /** Callback when the restore button is clicked. */
  onRestore?: (versionId: number) => void;
  /** Whether a restore mutation is currently in-flight. */
  isRestoring?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VersionTimeline({
  sceneTypeId: _sceneTypeId,
  versions,
  onDiff,
  onRestore,
  isRestoring = false,
}: VersionTimelineProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      // Allow max 2 selections for diff.
      if (prev.length >= 2) {
        const second = prev[1] as number;
        return [second, id];
      }
      return [...prev, id];
    });
  };

  const handleDiff = () => {
    if (selectedIds.length === 2 && onDiff) {
      const [idA, idB] = selectedIds as [number, number];
      onDiff(idA, idB);
    }
  };

  return (
    <div data-testid="version-timeline" className="space-y-3">
      {/* Diff action bar */}
      {onDiff && (
        <div className="flex items-center gap-2">
          <button
            data-testid="diff-btn"
            type="button"
            disabled={selectedIds.length !== 2}
            onClick={handleDiff}
            className="rounded border border-[var(--color-border-subtle)] px-3 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"
          >
            Compare Selected ({selectedIds.length}/2)
          </button>
        </div>
      )}

      {/* Empty state */}
      {versions.length === 0 && (
        <p
          data-testid="empty-state"
          className="py-6 text-center text-sm text-[var(--color-text-muted)]"
        >
          No versions yet. Save a prompt to create the first version.
        </p>
      )}

      {/* Version list */}
      {versions.map((ver) => (
        <div
          key={ver.id}
          data-testid={`version-item-${ver.id}`}
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <div className="flex items-center gap-3">
            {/* Checkbox for diff selection */}
            <input
              data-testid={`version-checkbox-${ver.id}`}
              type="checkbox"
              checked={selectedIds.includes(ver.id)}
              onChange={() => toggleSelect(ver.id)}
              className="h-4 w-4"
            />

            {/* Version info */}
            <div
              className="flex flex-1 cursor-pointer items-center gap-2"
              onClick={() =>
                setExpandedId((prev) => (prev === ver.id ? null : ver.id))
              }
            >
              <Badge variant="default">v{ver.version}</Badge>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(ver.created_at)}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                by user {ver.created_by_id}
              </span>
              {ver.change_notes && (
                <span className="truncate text-xs text-[var(--color-text-secondary)]">
                  - {ver.change_notes}
                </span>
              )}
            </div>

            {/* Restore button */}
            {onRestore && (
              <button
                data-testid={`restore-btn-${ver.id}`}
                type="button"
                disabled={isRestoring}
                onClick={() => onRestore(ver.id)}
                className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Restore
              </button>
            )}
          </div>

          {/* Expanded content */}
          {expandedId === ver.id && (
            <div
              data-testid={`version-content-${ver.id}`}
              className="mt-3 space-y-2 border-t border-[var(--color-border-subtle)] pt-3"
            >
              <div>
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Positive:
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-text-primary)]">
                  {ver.positive_prompt}
                </p>
              </div>
              {ver.negative_prompt && (
                <div>
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Negative:
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-text-primary)]">
                    {ver.negative_prompt}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
