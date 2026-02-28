/**
 * Zoom and filter controls for the Gantt timeline (PRD-90).
 *
 * Provides zoom level selector, status filter checkboxes, and
 * worker filter dropdown.
 */

import { Stack } from "@/components/layout";
import { Checkbox, Select } from "@/components/primitives";
import { JOB_STATUS_LABELS } from "@/lib/job-status";

import type { WorkerLane, ZoomLevel } from "./types";
import { ZOOM_LEVELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TimelineControlsProps {
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  statusFilter: Set<string>;
  onStatusFilterChange: (statuses: Set<string>) => void;
  workers: WorkerLane[];
  workerFilter: number | null;
  onWorkerFilterChange: (workerId: number | null) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TimelineControls({
  zoom,
  onZoomChange,
  statusFilter,
  onStatusFilterChange,
  workers,
  workerFilter,
  onWorkerFilterChange,
}: TimelineControlsProps) {
  const zoomOptions = ZOOM_LEVELS.map((z) => ({
    value: z.value,
    label: z.label,
  }));

  const workerOptions = [
    { value: "", label: "All Workers" },
    ...workers.map((w) => ({ value: String(w.id), label: w.name })),
  ];

  const allStatuses = Object.values(JOB_STATUS_LABELS).map((l) => l.toLowerCase());

  function handleStatusToggle(status: string, checked: boolean) {
    const next = new Set(statusFilter);
    if (checked) {
      next.add(status);
    } else {
      next.delete(status);
    }
    onStatusFilterChange(next);
  }

  function handleWorkerChange(value: string) {
    onWorkerFilterChange(value ? Number(value) : null);
  }

  return (
    <Stack direction="horizontal" gap={4} align="center" className="flex-wrap">
      {/* Zoom level */}
      <div className="w-40">
        <Select
          label="Zoom"
          options={zoomOptions}
          value={zoom}
          onChange={(v) => onZoomChange(v as ZoomLevel)}
        />
      </div>

      {/* Status filters */}
      <Stack direction="horizontal" gap={3} align="center" className="flex-wrap">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Status:</span>
        {allStatuses.map((status) => (
          <Checkbox
            key={status}
            label={status}
            checked={statusFilter.has(status)}
            onChange={(checked) => handleStatusToggle(status, checked)}
          />
        ))}
      </Stack>

      {/* Worker filter */}
      <div className="w-48">
        <Select
          label="Worker"
          options={workerOptions}
          value={workerFilter != null ? String(workerFilter) : ""}
          onChange={handleWorkerChange}
        />
      </div>
    </Stack>
  );
}
