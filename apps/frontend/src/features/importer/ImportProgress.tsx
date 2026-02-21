/**
 * Import progress tracker showing commit results (PRD-016).
 *
 * Displayed after the user commits an import, showing per-category
 * counts and an overall summary.
 */

import { Badge, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import type { ImportCommitResult } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImportProgressProps {
  /** Set while the commit is in flight. */
  isCommitting: boolean;
  /** The result once the commit is complete. */
  result: ImportCommitResult | null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportProgress({ isCommitting, result }: ImportProgressProps) {
  if (isCommitting) {
    return (
      <Stack align="center" gap={3} className="p-6" data-testid="import-progress">
        <Spinner size="lg" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Committing import...
        </p>
      </Stack>
    );
  }

  if (!result) {
    return null;
  }

  const total = result.created + result.updated + result.skipped + result.failed;

  return (
    <div
      className="rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)] p-6"
      data-testid="import-progress"
    >
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
        Import Complete
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Created" value={result.created} variant="success" />
        <StatCard label="Updated" value={result.updated} variant="info" />
        <StatCard label="Skipped" value={result.skipped} variant="default" />
        <StatCard label="Failed" value={result.failed} variant="warning" />
      </div>

      <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
        Total processed: <strong>{total}</strong>
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Stat card sub-component
   -------------------------------------------------------------------------- */

interface StatCardProps {
  label: string;
  value: number;
  variant: "success" | "info" | "default" | "warning";
}

function StatCard({ label, value, variant }: StatCardProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-primary)] p-3">
      <span className="text-2xl font-bold text-[var(--color-text-primary)]">
        {value}
      </span>
      <Badge size="sm" variant={variant}>
        {label}
      </Badge>
    </div>
  );
}
