/**
 * Branch cleanup component (PRD-50).
 *
 * Lists stale branches with bulk select and delete, and an
 * older-than-days filter for disk reclamation.
 */

import { useState } from "react";

import { Badge, Button, Checkbox } from "@/components";
import { formatDateTime } from "@/lib/format";

import type { Branch } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BranchCleanupProps {
  /** Stale branches returned by the API. */
  branches: Branch[];
  /** Current older-than-days filter value. */
  olderThanDays: number;
  /** Callback when the older-than-days filter changes. */
  onFilterChange?: (days: number) => void;
  /** Callback when selected branches should be deleted. */
  onBulkDelete?: (ids: number[]) => void;
  /** Whether a delete operation is in-flight. */
  isDeleting?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BranchCleanup({
  branches,
  olderThanDays,
  onFilterChange,
  onBulkDelete,
  isDeleting = false,
}: BranchCleanupProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === branches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(branches.map((b) => b.id)));
    }
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedIds.size > 0) {
      onBulkDelete([...selectedIds]);
      setSelectedIds(new Set());
    }
  };

  return (
    <div data-testid="branch-cleanup" className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          Older than:
          <select
            data-testid="days-filter"
            value={olderThanDays}
            onChange={(e) => onFilterChange?.(Number(e.target.value))}
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>

        {branches.length > 0 && (
          <div className="flex items-center gap-2">
            <span data-testid="select-all-checkbox">
              <Checkbox
                checked={selectedIds.size === branches.length}
                onChange={toggleAll}
                label="Select all"
              />
            </span>
            <Button
              data-testid="bulk-delete-btn"
              variant="danger"
              size="sm"
              disabled={selectedIds.size === 0 || isDeleting}
              onClick={handleBulkDelete}
            >
              Delete selected ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {branches.length === 0 && (
        <p
          data-testid="empty-state"
          className="py-4 text-center text-sm text-[var(--color-text-muted)]"
        >
          No stale branches found.
        </p>
      )}

      {/* Branch list */}
      <div className="space-y-1">
        {branches.map((branch) => (
          <div
            key={branch.id}
            data-testid={`stale-branch-${branch.id}`}
            className="flex items-center gap-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2"
          >
            <span data-testid={`select-${branch.id}`}>
              <Checkbox
                checked={selectedIds.has(branch.id)}
                onChange={() => toggleSelect(branch.id)}
              />
            </span>
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {branch.name}
              </span>
              <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                Scene {branch.scene_id}
              </span>
            </div>
            <Badge variant="warning">
              Last updated: {formatDateTime(branch.updated_at)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
