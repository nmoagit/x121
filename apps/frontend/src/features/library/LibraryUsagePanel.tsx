/**
 * Panel showing all projects using a library avatar (PRD-60).
 *
 * Displays a table of project names, avatar names, and import dates
 * for cross-project visibility.
 */

import { ContextLoader } from "@/components";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_TH,
} from "@/lib/ui-classes";
import { Layers } from "@/tokens/icons";

import { useLibraryUsage } from "./hooks/use-library";

interface LibraryUsagePanelProps {
  libraryAvatarId: number;
  libraryAvatarName?: string;
}

export function LibraryUsagePanel({
  libraryAvatarId,
  libraryAvatarName,
}: LibraryUsagePanelProps) {
  const { data: usage, isLoading, error } = useLibraryUsage(libraryAvatarId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ContextLoader size={32} />
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
    <div className={TERMINAL_PANEL} data-testid="usage-panel">
      <div className={cn(TERMINAL_HEADER, "flex items-center gap-2")}>
        <Layers
          size={14}
          className="text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <span className={TERMINAL_HEADER_TITLE}>
          Cross-Project Usage
          {libraryAvatarName && (
            <span className="font-normal text-[var(--color-text-muted)]">
              {" "}&mdash; {libraryAvatarName}
            </span>
          )}
        </span>
      </div>

      <div className={TERMINAL_BODY}>
        {!usage || usage.length === 0 ? (
          <p
            className="font-mono text-xs text-[var(--color-text-muted)] text-center py-6"
            data-testid="usage-empty"
          >
            Not imported into any projects yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={TERMINAL_DIVIDER}>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Project</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Avatar Name</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Imported</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((entry) => (
                  <tr
                    key={entry.link_id}
                    className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
                    data-testid={`usage-row-${entry.link_id}`}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs text-cyan-400">
                      {entry.project_name}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-primary)]">
                      {entry.avatar_name}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">
                      {formatDate(entry.imported_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
