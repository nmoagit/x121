import { Badge } from "@/components/primitives";
import {
  useTrashQueue,
  useRestoreTrashEntry,
} from "@/features/admin/hooks/use-reclamation";
import { formatBytes, formatCountdown } from "@/lib/format";

/**
 * Table of pending trash queue items with restore functionality.
 */
export function TrashBrowser() {
  const { data: entries, isLoading } = useTrashQueue("pending");
  const restoreMutation = useRestoreTrashEntry();

  if (isLoading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading trash queue...</p>;
  }

  if (!entries || entries.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No pending items in the trash queue.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border-primary)]">
            <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
              File Path
            </th>
            <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
              Entity Type
            </th>
            <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
              Size
            </th>
            <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
              Deletes In
            </th>
            <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const countdown = formatCountdown(entry.delete_after);
            const isExpired = countdown === "expired";
            return (
              <tr
                key={entry.id}
                className="border-b border-[var(--color-border-primary)]"
              >
                <td
                  className="max-w-xs truncate px-4 py-2 text-[var(--color-text-primary)]"
                  title={entry.file_path}
                >
                  {entry.file_path}
                </td>
                <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                  {entry.entity_type}
                </td>
                <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                  {formatBytes(entry.file_size_bytes)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Badge variant={isExpired ? "danger" : "warning"} size="sm">
                    {countdown}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => restoreMutation.mutate(entry.id)}
                    disabled={restoreMutation.isPending}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50"
                  >
                    Restore
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
