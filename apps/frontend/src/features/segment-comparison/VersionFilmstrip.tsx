/**
 * Horizontal filmstrip of all segment versions (PRD-101).
 *
 * Renders a scrollable row of version thumbnail cards. Click one version
 * then another to set the comparison pair. The active (selected) version
 * gets a "Current" badge.
 */

import { useState } from "react";

import { Badge, Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

import { useVersionHistory } from "./hooks/use-segment-versions";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface VersionFilmstripProps {
  segmentId: number;
  selectedV1: number;
  selectedV2: number;
  onSelectPair: (v1: number, v2: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VersionFilmstrip({
  segmentId,
  selectedV1,
  selectedV2,
  onSelectPair,
}: VersionFilmstripProps) {
  const { data: versions, isLoading } = useVersionHistory(segmentId);
  const [pendingFirst, setPendingFirst] = useState<number | null>(null);

  function handleVersionClick(versionNumber: number) {
    if (pendingFirst === null) {
      // First selection — store and wait for second.
      setPendingFirst(versionNumber);
    } else {
      // Second selection — emit the pair and reset.
      const v1 = Math.min(pendingFirst, versionNumber);
      const v2 = Math.max(pendingFirst, versionNumber);
      onSelectPair(v1, v2);
      setPendingFirst(null);
    }
  }

  if (isLoading) {
    return (
      <div
        data-testid="version-filmstrip-loading"
        className="flex items-center justify-center py-4"
      >
        <Spinner size="sm" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div
        data-testid="version-filmstrip-empty"
        className="text-sm text-[var(--color-text-muted)] py-2"
      >
        No versions available
      </div>
    );
  }

  return (
    <div data-testid="version-filmstrip" className="space-y-2">
      {pendingFirst !== null && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Selected v{pendingFirst} — click another version to compare
        </p>
      )}

      <div className="flex gap-[var(--spacing-2)] overflow-x-auto pb-1">
        {versions.map((version) => {
          const isSelected =
            version.version_number === selectedV1 || version.version_number === selectedV2;
          const isPending = version.version_number === pendingFirst;

          return (
            <button
              key={version.id}
              type="button"
              data-testid={`filmstrip-version-${version.version_number}`}
              onClick={() => handleVersionClick(version.version_number)}
              className={cn(
                "flex flex-col items-center gap-1 p-[var(--spacing-2)]",
                "rounded-[var(--radius-md)] border-2 transition-colors shrink-0",
                "hover:bg-[var(--color-surface-secondary)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
                isSelected &&
                  "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/5",
                isPending && !isSelected && "border-[var(--color-action-warning)]",
                !isSelected && !isPending && "border-[var(--color-border-default)]",
              )}
            >
              {/* Thumbnail */}
              <div className="w-20 h-12 rounded-[var(--radius-sm)] bg-[var(--color-surface-tertiary)] overflow-hidden flex items-center justify-center">
                {version.thumbnail_path ? (
                  <img
                    src={version.thumbnail_path}
                    alt={`Version ${version.version_number}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    v{version.version_number}
                  </span>
                )}
              </div>

              {/* Version label */}
              <span className="text-xs font-medium text-[var(--color-text-primary)]">
                v{version.version_number}
              </span>

              {/* Date */}
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {formatDate(version.created_at)}
              </span>

              {/* Badges */}
              <div className="flex gap-1">
                {version.selected && (
                  <Badge variant="success" size="sm">
                    Current
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
