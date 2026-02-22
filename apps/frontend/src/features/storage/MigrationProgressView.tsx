/**
 * Storage migration progress view (PRD-48).
 *
 * Displays transfer progress (file count, byte count, progress bar),
 * status badge, error log, and a rollback button for failed/in-progress
 * migrations.
 */

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Badge } from "@/components/primitives";
import { formatBytes, formatDateTime } from "@/lib/format";
import { AlertCircle } from "@/tokens/icons";

import type { StorageMigration, StorageMigrationStatusId } from "./types";
import { MIGRATION_STATUS, MIGRATION_STATUS_LABELS, MIGRATION_STATUS_VARIANT } from "./types";

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
  const statusVariant =
    MIGRATION_STATUS_VARIANT[migration.status_id as StorageMigrationStatusId] ?? "default";
  const statusLabel =
    MIGRATION_STATUS_LABELS[migration.status_id as StorageMigrationStatusId] ?? "Unknown";
  const pct = fileProgress(migration);
  const errors = Array.isArray(migration.error_log) ? migration.error_log : [];

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Migration #{migration.id}
          </span>
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardBody className="px-[var(--spacing-4)] py-[var(--spacing-3)] space-y-[var(--spacing-3)]">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {migration.transferred_files} / {migration.total_files} files
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-[var(--color-surface-tertiary)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
          <div>
            <span className="font-medium text-[var(--color-text-secondary)]">Transferred:</span>{" "}
            {formatBytes(migration.transferred_bytes)} / {formatBytes(migration.total_bytes)}
          </div>
          <div>
            <span className="font-medium text-[var(--color-text-secondary)]">Verified:</span>{" "}
            {migration.verified_files} files
          </div>
          <div>
            <span className="font-medium text-[var(--color-text-secondary)]">Failed:</span>{" "}
            {migration.failed_files} files
          </div>
          {migration.started_at && (
            <div>
              <span className="font-medium text-[var(--color-text-secondary)]">Started:</span>{" "}
              {formatDateTime(migration.started_at)}
            </div>
          )}
        </div>

        {/* Error log */}
        {errors.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-surface-tertiary)] p-[var(--spacing-2)]">
            <div className="flex items-center gap-[var(--spacing-1)] text-xs font-medium text-[var(--color-danger)]">
              <AlertCircle size={14} aria-hidden />
              Errors ({errors.length})
            </div>
            <ul className="mt-1 max-h-32 overflow-auto text-xs text-[var(--color-text-muted)]">
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
          <button
            type="button"
            onClick={() => onRollback(migration.id)}
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)] px-[var(--spacing-3)] py-[var(--spacing-1)] text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-colors"
          >
            Rollback Migration
          </button>
        )}
      </CardBody>
    </Card>
  );
}
