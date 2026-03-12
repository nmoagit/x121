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
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useSetToggle } from "@/hooks/useSetToggle";

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
  useSetPageTitle("Queue Manager");

  const [filter, setFilter] = useState<QueueJobFilter>(DEFAULT_FILTER);
  const [selectedIds, handleToggleSelect, setSelectedIds] = useSetToggle<number>();
  const { data: stats } = useQueueStats();

  const handleSelectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, [setSelectedIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  return (
    <div className="space-y-6">
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
