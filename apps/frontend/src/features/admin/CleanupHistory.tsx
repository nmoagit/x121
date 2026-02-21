import { Badge } from "@/components/primitives";
import { useReclamationHistory } from "@/features/admin/hooks/use-reclamation";
import { formatBytes, formatDateTime } from "@/lib/format";

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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border-primary)]">
            <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
              Date
            </th>
            <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
              Type
            </th>
            <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
              Files Deleted
            </th>
            <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
              Bytes Reclaimed
            </th>
            <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-[var(--color-border-primary)]"
            >
              <td className="px-4 py-2 text-[var(--color-text-primary)]">
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
                  <Badge variant="warning" size="sm">
                    Errors
                  </Badge>
                ) : run.completed_at ? (
                  <Badge variant="success" size="sm">
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="info" size="sm">
                    Running
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
