import { Button } from "@/components/primitives";
import {
  useTrashQueue,
  useRestoreTrashEntry,
} from "@/features/admin/hooks/use-reclamation";
import { formatBytes, formatCountdown } from "@/lib/format";
import { TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

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
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className={TERMINAL_DIVIDER}>
            <th className={cn(TERMINAL_TH, "px-4 py-2")}>File Path</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2")}>Entity Type</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Size</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Deletes In</th>
            <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const countdown = formatCountdown(entry.delete_after);
            const isExpired = countdown === "expired";
            return (
              <tr
                key={entry.id}
                className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
              >
                <td
                  className="max-w-xs truncate px-4 py-2 text-cyan-400"
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
                  <span className={isExpired ? "text-red-400" : "text-orange-400"}>
                    {countdown}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => restoreMutation.mutate(entry.id)}
                    disabled={restoreMutation.isPending}
                  >
                    Restore
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
