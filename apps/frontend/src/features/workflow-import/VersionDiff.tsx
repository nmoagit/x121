/**
 * Workflow version diff component (PRD-75).
 *
 * Shows the change summaries and a simplified list of JSON keys
 * that differ between two workflow versions.
 */

import { Badge } from "@/components/primitives";

import { useDiffVersions } from "./hooks/use-workflow-import";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VersionDiffProps {
  /** Workflow ID. */
  workflowId: number;
  /** First version number. */
  versionA: number;
  /** Second version number. */
  versionB: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VersionDiff({
  workflowId,
  versionA,
  versionB,
}: VersionDiffProps) {
  const { data: diff, isLoading } = useDiffVersions(
    workflowId,
    versionA,
    versionB,
  );

  if (isLoading) {
    return (
      <div
        data-testid="diff-loading"
        className="text-sm text-[var(--color-text-tertiary)]"
      >
        Loading diff...
      </div>
    );
  }

  if (!diff) {
    return (
      <div
        data-testid="diff-empty"
        className="text-sm text-[var(--color-text-tertiary)]"
      >
        No diff data available.
      </div>
    );
  }

  const keysChanged = diff.keys_changed ?? [];

  return (
    <div data-testid="version-diff" className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="info">v{versionA}</Badge>
        <span className="text-[var(--color-text-tertiary)]">vs</span>
        <Badge variant="info">v{versionB}</Badge>
      </div>

      {/* Change summaries */}
      <div className="space-y-2">
        {diff.change_summary_a && (
          <div>
            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
              v{versionA}:
            </span>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {diff.change_summary_a}
            </p>
          </div>
        )}
        {diff.change_summary_b && (
          <div>
            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
              v{versionB}:
            </span>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {diff.change_summary_b}
            </p>
          </div>
        )}
      </div>

      {/* Changed keys */}
      {keysChanged.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">
            Changed Nodes ({keysChanged.length})
          </h4>
          <ul className="space-y-1">
            {keysChanged.map((key) => (
              <li
                key={key}
                data-testid={`diff-key-${key}`}
                className="text-sm text-[var(--color-text-secondary)]"
              >
                <span className="font-mono text-[var(--color-action-warning)]">
                  ~
                </span>{" "}
                {key}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p
          data-testid="diff-no-changes"
          className="text-sm text-[var(--color-text-tertiary)]"
        >
          No differences found between these versions.
        </p>
      )}
    </div>
  );
}
