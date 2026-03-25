/**
 * BackupList -- table of backups with sortable columns (PRD-81).
 *
 * Displays all backups in a responsive table with type, status badge, size,
 * date, verified indicator, and action buttons.
 */

import { ContextLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";

import { useBackups } from "./hooks/use-backup-recovery";
import { BackupRow } from "./BackupRow";

/* --------------------------------------------------------------------------
   Table header
   -------------------------------------------------------------------------- */

const COLUMNS = ["Type", "Status", "Size", "Date", "Triggered", "Verified", "Actions"];

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/50">
        {COLUMNS.map((col) => (
          <th
            key={col}
            className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface BackupListProps {
  params?: Record<string, string>;
}

export function BackupList({ params }: BackupListProps) {
  const { data: backups, isPending, isError } = useBackups(params);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="backup-list-loading">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load backups.
      </div>
    );
  }

  if (!backups || backups.length === 0) {
    return (
      <Card elevation="flat" padding="lg">
        <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="backup-list-empty">
          No backups found. Trigger one to get started.
        </div>
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "overflow-x-auto",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)]",
        "bg-[var(--color-surface-secondary)]",
      )}
      data-testid="backup-list"
    >
      <table className="w-full text-left">
        <TableHead />
        <tbody>
          {backups.map((backup) => (
            <BackupRow key={backup.id} backup={backup} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
