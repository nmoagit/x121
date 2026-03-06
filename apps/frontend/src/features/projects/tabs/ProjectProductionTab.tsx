/**
 * Project production tab (PRD-112, Amendments A.1-A.3).
 *
 * Shows a "Queue Outstanding" button that opens the QueueOutstandingModal,
 * along with basic queue status and production run summaries.
 *
 * Archived characters (status_id === 3) are excluded from the production view.
 */

import { useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { List, Play, Zap } from "@/tokens/icons";

import { useProductionRuns } from "@/features/production/hooks/use-production";
import { RUN_STATUS_LABELS, RUN_STATUS_VARIANT } from "@/features/production/types";
import { useQueueStatus } from "@/features/queue/hooks/use-queue";

import { QueueOutstandingModal } from "../components/QueueOutstandingModal";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectProductionTabProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectProductionTab({ projectId }: ProjectProductionTabProps) {
  const [queueModalOpen, setQueueModalOpen] = useState(false);

  const { data: queueStatus } = useQueueStatus();
  const { data: runs, isLoading: runsLoading } = useProductionRuns(projectId);

  return (
    <Stack gap={6}>
      {/* Action bar */}
      <div className="flex items-center justify-between gap-[var(--spacing-4)]">
        <div className="flex items-center gap-[var(--spacing-3)]">
          <Button onClick={() => setQueueModalOpen(true)} icon={<Play size={16} />}>
            Queue Outstanding
          </Button>

          {queueStatus && (
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Badge variant="info" size="sm">
                {queueStatus.total_queued} queued
              </Badge>
              <Badge variant="default" size="sm">
                {queueStatus.total_running} running
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Production runs list */}
      {runsLoading && <LoadingPane />}

      {!runsLoading && (!runs || runs.length === 0) && (
        <EmptyState
          icon={<Zap size={32} />}
          title="No production runs yet"
          description="Queue scenes for generation to create production runs."
        />
      )}

      {!runsLoading && runs && runs.length > 0 && (
        <div className="space-y-[var(--spacing-3)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Production Runs
          </h3>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] divide-y divide-[var(--color-border-default)]">
            {runs.map((run) => {
              const statusLabel = RUN_STATUS_LABELS[run.status_id] ?? "Unknown";
              const statusVariant = RUN_STATUS_VARIANT[run.status_id] ?? "default";
              const pct =
                run.total_cells > 0 ? Math.round((run.completed_cells / run.total_cells) * 100) : 0;

              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-3)]"
                >
                  <div className="flex items-center gap-[var(--spacing-3)] min-w-0">
                    <List size={16} className="text-[var(--color-text-muted)] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">
                        {run.name}
                      </span>
                      {run.description && (
                        <span className="text-xs text-[var(--color-text-muted)] truncate block">
                          {run.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-[var(--spacing-2)] shrink-0">
                    <Badge variant={statusVariant} size="sm">
                      {statusLabel}
                    </Badge>
                    <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                      {run.completed_cells}/{run.total_cells} ({pct}%)
                    </span>
                    {run.failed_cells > 0 && (
                      <Badge variant="danger" size="sm">
                        {run.failed_cells} failed
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Outstanding Modal */}
      <QueueOutstandingModal
        open={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        projectId={projectId}
      />
    </Stack>
  );
}
