/**
 * Annotation summary list sorted by frame number (PRD-70).
 *
 * Displays all annotations for a segment grouped by frame, showing
 * annotator info, tool types used, and clickable entries to jump to frames.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { formatDateTime } from "@/lib/format";

import type { DrawingTool, FrameAnnotation } from "./types";
import { toolLabel } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AnnotationSummaryProps {
  /** All annotations for the segment. */
  annotations: FrameAnnotation[];
  /** Called when a frame entry is clicked, passing the frame number. */
  onFrameSelect?: (frameNumber: number) => void;
  /** Optional filter: only show annotations by this user ID. */
  filterUserId?: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Extract unique tool types from an annotation's JSON data. */
function getToolTypes(annotation: FrameAnnotation): DrawingTool[] {
  if (!Array.isArray(annotation.annotations_json)) return [];
  const tools = new Set<DrawingTool>();
  for (const obj of annotation.annotations_json) {
    if (obj && typeof obj.tool === "string") {
      tools.add(obj.tool as DrawingTool);
    }
  }
  return Array.from(tools);
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AnnotationSummary({
  annotations,
  onFrameSelect,
  filterUserId,
}: AnnotationSummaryProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(
    filterUserId,
  );

  // Get unique annotator IDs for the filter dropdown.
  const annotatorIds = [
    ...new Set(annotations.map((a) => a.user_id)),
  ].sort();

  // Apply user filter.
  const filteredAnnotations = selectedUserId != null
    ? annotations.filter((a) => a.user_id === selectedUserId)
    : annotations;

  // Sort by frame number ascending.
  const sorted = [...filteredAnnotations].sort(
    (a, b) => a.frame_number - b.frame_number,
  );

  return (
    <div className="flex flex-col gap-2" data-testid="annotation-summary">
      {/* Filter by annotator */}
      {annotatorIds.length > 1 && (
        <div className="flex items-center gap-2" data-testid="annotator-filter">
          <label
            htmlFor="annotator-filter-select"
            className="text-xs text-[var(--color-text-muted)]"
          >
            Filter by annotator
          </label>
          <select
            id="annotator-filter-select"
            className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs"
            value={selectedUserId ?? ""}
            onChange={(e) =>
              setSelectedUserId(
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            data-testid="annotator-select"
          >
            <option value="">All annotators</option>
            {annotatorIds.map((id) => (
              <option key={id} value={id}>
                User #{id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Empty state */}
      {sorted.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
          No annotations found.
        </p>
      )}

      {/* Annotation entries */}
      {sorted.map((annotation) => {
        const tools = getToolTypes(annotation);
        return (
          <button
            key={annotation.id}
            type="button"
            className="flex items-center justify-between rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-left hover:bg-[var(--color-surface-tertiary)]"
            onClick={() => onFrameSelect?.(annotation.frame_number)}
            data-testid={`summary-entry-${annotation.id}`}
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-sm font-medium text-[var(--color-text-primary)]"
                  data-testid={`summary-frame-${annotation.id}`}
                >
                  Frame {annotation.frame_number}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  User #{annotation.user_id}
                </span>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(annotation.created_at)}
              </span>
            </div>
            <div className="flex gap-1">
              {tools.map((tool) => (
                <Badge key={tool} variant="default" size="sm">
                  {toolLabel(tool)}
                </Badge>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
