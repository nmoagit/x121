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

import { useCallback, useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useSetToggle } from "@/hooks/useSetToggle";
import { TERMINAL_PANEL } from "@/lib/ui-classes";
import { usePipelineContextSafe } from "@/features/pipelines/PipelineProvider";

import { useQueueStats } from "./hooks/use-queue";
import { QueueStatsPanel } from "./QueueStatsPanel";
import { QueueFilterBar } from "./QueueFilterBar";
import { QueueTable } from "./QueueTable";
import { BulkActionToolbar } from "./JobActions";
import { WorkerDrainPanel } from "./WorkerDrainPanel";
import { QueueActivityLog } from "./QueueActivityLog";
import { ScheduledGenerationsPanel } from "./ScheduledGenerationsPanel";
import type { QueueJobFilter } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QueueManagerPage() {
  const pipelineCtx = usePipelineContextSafe();

  useSetPageTitle(
    pipelineCtx ? `Queue — ${pipelineCtx.pipeline.name}` : "Queue Manager",
  );

  const defaultFilter = useMemo<QueueJobFilter>(
    () => ({
      limit: 50,
      offset: 0,
      pipeline_id: pipelineCtx?.pipelineId,
    }),
    [pipelineCtx?.pipelineId],
  );

  const [filter, setFilter] = useState<QueueJobFilter>(defaultFilter);
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

      {/* Scheduled generations (PRD-134) — shown above the jobs table */}
      <ScheduledGenerationsPanel />

      {/* Jobs table */}
      <div className={TERMINAL_PANEL}>
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
