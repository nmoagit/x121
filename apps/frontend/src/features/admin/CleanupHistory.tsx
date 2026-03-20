import { useReclamationHistory } from "@/features/admin/hooks/use-reclamation";
import { formatBytes, formatDateTime } from "@/lib/format";
import { TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

/**
 * Table of past reclamation runs showing statistics.
 */
export function CleanupHistory() {
  const { data: runs, isLoading } = useReclamationHistory();

  if (isLoading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading history...</p>;
  }

  if (!runs || runs.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No cleanup runs yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className={TERMINAL_DIVIDER}>
            <th className={cn(TERMINAL_TH, "px-4 py-2")}>Date</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2")}>Type</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Files Deleted</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Bytes Reclaimed</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
            >
              <td className="px-4 py-2 text-cyan-400">
                {formatDateTime(run.started_at)}
              </td>
              <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                {run.run_type}
              </td>
              <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                {run.files_deleted}
              </td>
              <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                {formatBytes(run.bytes_reclaimed)}
              </td>
              <td className="px-4 py-2">
                {run.error_message ? (
                  <span className="text-orange-400">Errors</span>
                ) : run.completed_at ? (
                  <span className="text-green-400">Complete</span>
                ) : (
                  <span className="text-cyan-400">Running</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
