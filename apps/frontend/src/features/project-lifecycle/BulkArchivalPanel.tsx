/**
 * Bulk archival panel component (PRD-72).
 *
 * Provides a multi-select interface for archiving multiple delivered
 * projects at once, with confirmation and result feedback.
 */

import { useState } from "react";

import { Button, Checkbox } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { formatDateTime } from "@/lib/format";

import { useBulkArchive } from "./hooks/use-project-lifecycle";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface DeliveredProject {
  id: number;
  name: string;
  delivered_at: string;
}

interface BulkArchivalPanelProps {
  projects: DeliveredProject[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BulkArchivalPanel({ projects }: BulkArchivalPanelProps) {
  const bulkArchive = useBulkArchive();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const allSelected = projects.length > 0 && selectedIds.size === projects.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  }

  function handleArchive() {
    bulkArchive.mutate(
      { project_ids: Array.from(selectedIds) },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setShowConfirm(false);
        },
      },
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No delivered projects available for archival.
      </p>
    );
  }

  return (
    <div data-testid="bulk-archival-panel">
      <div className="flex items-center justify-between mb-[var(--spacing-3)]">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={toggleAll}
          label={`Select All (${projects.length})`}
        />
        <Button
          variant="danger"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() => setShowConfirm(true)}
        >
          Archive ({selectedIds.size})
        </Button>
      </div>

      <ul className="divide-y divide-[var(--color-border-default)]">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center gap-[var(--spacing-3)] py-[var(--spacing-2)]"
          >
            <Checkbox
              checked={selectedIds.has(project.id)}
              onChange={() => toggleId(project.id)}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {project.name}
              </span>
              <span className="ml-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
                Delivered {formatDateTime(project.delivered_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {bulkArchive.isSuccess && (
        <p className="text-sm text-[var(--color-action-success)] mt-[var(--spacing-3)]">
          Archived {bulkArchive.data.archived_count} project(s).
          {bulkArchive.data.failed_ids.length > 0 && (
            <span className="text-[var(--color-action-danger)]">
              {" "}Failed: {bulkArchive.data.failed_ids.join(", ")}
            </span>
          )}
        </p>
      )}

      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Bulk Archive"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-[var(--spacing-4)]">
          Archive {selectedIds.size} project(s)? Archived projects are
          edit-locked but can be re-opened later.
        </p>
        <div className="flex justify-end gap-[var(--spacing-3)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={bulkArchive.isPending}
            onClick={handleArchive}
          >
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}
