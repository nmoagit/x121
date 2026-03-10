/**
 * Queue Manager page — assembles all queue management sub-components (PRD-132).
 *
 * Layout:
 * 1. QueueStatsPanel (top)
 * 2. QueueFilterBar
 * 3. BulkActionToolbar (when rows selected)
 * 4. QueueTable (center, scrollable)
 * 5. WorkerDrainPanel (collapsible)
 * 6. QueueActivityLog (collapsible)
 */

import { useCallback, useState } from "react";

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import { Stack } from "@/components/layout";

import { useQueueStats } from "./hooks/use-queue";
import { QueueStatsPanel } from "./QueueStatsPanel";
import { QueueFilterBar } from "./QueueFilterBar";
import { QueueTable } from "./QueueTable";
import { BulkActionToolbar } from "./JobActions";
import { WorkerDrainPanel } from "./WorkerDrainPanel";
import { QueueActivityLog } from "./QueueActivityLog";
import type { QueueJobFilter } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_FILTER: QueueJobFilter = {
  limit: 50,
  offset: 0,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QueueManagerPage() {
  const [filter, setFilter] = useState<QueueJobFilter>(DEFAULT_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { data: stats } = useQueueStats();

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <Stack direction="horizontal" gap={2} align="center">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Queue Manager
        </h1>
      </Stack>

      {/* Stats panel */}
      <QueueStatsPanel />

      {/* Filter bar */}
      <QueueFilterBar filter={filter} onChange={setFilter} />

      {/* Bulk actions (visible when rows are selected) */}
      <BulkActionToolbar
        selectedJobIds={Array.from(selectedIds)}
        onClearSelection={handleClearSelection}
      />

      {/* Jobs table */}
      <div className="border border-[var(--color-border-default)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-surface-secondary)]">
        <QueueTable
          filter={filter}
          onFilterChange={setFilter}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
        />
      </div>

      {/* Worker drain panel */}
      <CollapsibleSection title="Worker Management" defaultOpen={false}>
        <WorkerDrainPanel workerLoad={stats?.per_worker_load} />
      </CollapsibleSection>

      {/* Activity log */}
      <QueueActivityLog />
    </div>
  );
}
