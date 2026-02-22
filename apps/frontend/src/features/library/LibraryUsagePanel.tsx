/**
 * Panel showing all projects using a library character (PRD-60).
 *
 * Displays a table of project names, character names, and import dates
 * for cross-project visibility.
 */

import { Spinner } from "@/components";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { Layers } from "@/tokens/icons";

import { useLibraryUsage } from "./hooks/use-library";

interface LibraryUsagePanelProps {
  libraryCharacterId: number;
  libraryCharacterName?: string;
}

export function LibraryUsagePanel({
  libraryCharacterId,
  libraryCharacterName,
}: LibraryUsagePanelProps) {
  const { data: usage, isLoading, error } = useLibraryUsage(libraryCharacterId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--color-status-error)] text-center py-4">
        Failed to load usage data.
      </p>
    );
  }

  return (
    <div data-testid="usage-panel">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Layers
          size={16}
          className="text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
          Cross-Project Usage
          {libraryCharacterName && (
            <span className="text-[var(--color-text-muted)] font-normal">
              {" "}
              &mdash; {libraryCharacterName}
            </span>
          )}
        </h4>
      </div>

      {/* Usage list */}
      {!usage || usage.length === 0 ? (
        <p
          className="text-sm text-[var(--color-text-muted)] text-center py-6"
          data-testid="usage-empty"
        >
          Not imported into any projects yet.
        </p>
      ) : (
        <div
          className={cn(
            "border border-[var(--color-border-default)]",
            "rounded-[var(--radius-md)] overflow-hidden",
          )}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-tertiary)]">
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)]">
                  Project
                </th>
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)]">
                  Character Name
                </th>
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)]">
                  Imported
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.map((entry) => (
                <tr
                  key={entry.link_id}
                  className="border-t border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]"
                  data-testid={`usage-row-${entry.link_id}`}
                >
                  <td className="px-3 py-2 text-[var(--color-text-primary)]">
                    {entry.project_name}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-primary)]">
                    {entry.character_name}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">
                    {formatDate(entry.imported_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
