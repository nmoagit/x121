/**
 * Render queue timeline page (PRD-90).
 *
 * Combines controls and Gantt chart into a full-page view.
 */

import { useMemo, useState } from "react";

import { Card, CardBody } from "@/components/composite";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { WireframeLoader } from "@/components/primitives";

import { JOB_STATUS_LABELS } from "@/lib/job-status";

import { GanttTimeline } from "./GanttTimeline";
import { ReorderDialog } from "./ReorderDialog";
import { TimelineControls } from "./TimelineControls";
import { useTimeline } from "./hooks/use-render-timeline";
import type { TimelineJob, ZoomLevel } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RenderTimelinePage() {
  useSetPageTitle("Render Timeline");
  const [zoom, setZoom] = useState<ZoomLevel>("6h");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(Object.values(JOB_STATUS_LABELS).map((l) => l.toLowerCase())),
  );
  const [workerFilter, setWorkerFilter] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<TimelineJob | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);

  const { data, isLoading, isError } = useTimeline(zoom);

  const workers = useMemo(() => data?.workers ?? [], [data]);

  function handleJobClick(job: TimelineJob) {
    setSelectedJob(job);
    setReorderOpen(true);
  }

  function handleReorderClose() {
    setReorderOpen(false);
    setSelectedJob(null);
  }

  return (
    <Stack direction="vertical" gap={4} className="h-full">
      <Card padding="lg">
        <CardBody>
          <Stack direction="vertical" gap={4}>
            {/* Controls */}
            <TimelineControls
              zoom={zoom}
              onZoomChange={setZoom}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              workers={workers}
              workerFilter={workerFilter}
              onWorkerFilterChange={setWorkerFilter}
            />

            {/* Timeline chart */}
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <WireframeLoader size={48} />
              </div>
            )}

            {isError && (
              <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
                Failed to load timeline data
              </div>
            )}

            {data && (
              <GanttTimeline
                jobs={data.jobs}
                workers={data.workers}
                windowStart={data.from}
                windowEnd={data.to}
                zoom={zoom}
                statusFilter={statusFilter}
                workerFilter={workerFilter}
                onJobClick={handleJobClick}
              />
            )}
          </Stack>
        </CardBody>
      </Card>

      {/* Reorder dialog */}
      <ReorderDialog job={selectedJob} open={reorderOpen} onClose={handleReorderClose} />
    </Stack>
  );
}
