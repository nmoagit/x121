/**
 * Storage migration progress view (PRD-48).
 *
 * Displays transfer progress (file count, byte count, progress bar),
 * status badge, error log, and a rollback button for failed/in-progress
 * migrations.
 */

import { Button } from "@/components/primitives";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  GHOST_DANGER_BTN,
  TERMINAL_BODY,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_LABEL,
  TERMINAL_PANEL,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { AlertCircle } from "@/tokens/icons";

import type { StorageMigration, StorageMigrationStatusId } from "./types";
import { MIGRATION_STATUS, MIGRATION_STATUS_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Compute file progress percentage. */
function fileProgress(migration: StorageMigration): number {
  if (migration.total_files === 0) return 0;
  return Math.round((migration.transferred_files / migration.total_files) * 100);
}

/** Whether this migration can be rolled back. */
function canRollback(statusId: StorageMigrationStatusId): boolean {
  return (
    statusId === MIGRATION_STATUS.IN_PROGRESS || statusId === MIGRATION_STATUS.FAILED
  );
}

/** Map migration status to a terminal color key. */
function migrationStatusColorKey(statusId: StorageMigrationStatusId): string {
  const map: Record<StorageMigrationStatusId, string> = {
    1: "pending",       // Pending
    2: "in_progress",   // In Progress
    3: "queued",        // Verifying -> warning
    4: "completed",     // Completed
    5: "failed",        // Failed
    6: "pending",       // Rolled Back -> muted
  };
  return map[statusId] ?? "pending";
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface MigrationProgressViewProps {
  migration: StorageMigration;
  onRollback?: (id: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MigrationProgressView({ migration, onRollback }: MigrationProgressViewProps) {
  const statusLabel =
    MIGRATION_STATUS_LABELS[migration.status_id as StorageMigrationStatusId] ?? "Unknown";
  const statusColor =
    TERMINAL_STATUS_COLORS[migrationStatusColorKey(migration.status_id as StorageMigrationStatusId)] ??
    "text-[var(--color-text-muted)]";
  const pct = fileProgress(migration);
  const errors = Array.isArray(migration.error_log) ? migration.error_log : [];

  return (
    <div className={TERMINAL_PANEL}>
      {/* Header */}
      <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
        <span className={TERMINAL_HEADER_TITLE}>Migration #{migration.id}</span>
        <span className={`font-mono text-xs uppercase ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Body */}
      <div className={`${TERMINAL_BODY} space-y-3`}>
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between font-mono text-xs text-[var(--color-text-muted)]">
            <span>
              {migration.transferred_files} / {migration.total_files} files
            </span>
            <span className="text-cyan-400">{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={TERMINAL_LABEL}>Transferred</span>
            <p className="font-mono text-xs text-cyan-400">
              {formatBytes(migration.transferred_bytes)} / {formatBytes(migration.total_bytes)}
            </p>
          </div>
          <div>
            <span className={TERMINAL_LABEL}>Verified</span>
            <p className="font-mono text-xs text-green-400">
              {migration.verified_files} files
            </p>
          </div>
          <div>
            <span className={TERMINAL_LABEL}>Failed</span>
            <p className={`font-mono text-xs ${migration.failed_files > 0 ? "text-red-400" : "text-[var(--color-text-muted)]"}`}>
              {migration.failed_files} files
            </p>
          </div>
          {migration.started_at && (
            <div>
              <span className={TERMINAL_LABEL}>Started</span>
              <p className="font-mono text-xs text-[var(--color-text-muted)]">
                {formatDateTime(migration.started_at)}
              </p>
            </div>
          )}
        </div>

        {/* Error log */}
        {errors.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-red-400/30 bg-[#0d1117] p-2">
            <div className="flex items-center gap-1 font-mono text-xs font-medium text-red-400">
              <AlertCircle size={14} aria-hidden />
              ERRORS ({errors.length})
            </div>
            <ul className="mt-1 max-h-32 overflow-auto font-mono text-xs text-[var(--color-text-muted)]">
              {errors.map((err, i) => (
                <li key={i} className="truncate">
                  {String(err)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rollback button */}
        {canRollback(migration.status_id as StorageMigrationStatusId) && onRollback && (
          <Button
            variant="ghost"
            size="sm"
            className={GHOST_DANGER_BTN}
            onClick={() => onRollback(migration.id)}
          >
            Rollback Migration
          </Button>
        )}
      </div>
    </div>
  );
}
