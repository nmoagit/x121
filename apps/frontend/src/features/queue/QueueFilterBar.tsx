/**
 * Queue filter toolbar (PRD-132).
 *
 * Provides status, worker, and job type filters with removable chips
 * for active filters. Integrates with parent state via props.
 */

import { useCallback } from "react";

import { Button, Checkbox, RemovableChip, Select } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { ListFilter, X } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { TERMINAL_PANEL, TERMINAL_BODY, TERMINAL_LABEL } from "@/lib/ui-classes";
import { usePipelines } from "@/features/pipelines/hooks/use-pipelines";

import { useWorkerInstances } from "./hooks/use-queue";
import type { QueueJobFilter } from "./types";
import {
  JOB_STATUS_PENDING,
  JOB_STATUS_RUNNING,
  JOB_STATUS_COMPLETED,
  JOB_STATUS_FAILED,
  JOB_STATUS_CANCELLED,
  JOB_STATUS_PAUSED,
  JOB_STATUS_HELD,
  statusLabel,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FILTERABLE_STATUSES = [
  JOB_STATUS_PENDING,
  JOB_STATUS_RUNNING,
  JOB_STATUS_COMPLETED,
  JOB_STATUS_FAILED,
  JOB_STATUS_CANCELLED,
  JOB_STATUS_PAUSED,
  JOB_STATUS_HELD,
] as const;

const JOB_TYPES = [
  { label: "All Types", value: "" },
  { label: "Generation", value: "generation" },
  { label: "Image Generation", value: "image_generation" },
  { label: "Upscale", value: "upscale" },
  { label: "Preview", value: "preview" },
] as const;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QueueFilterBarProps {
  filter: QueueJobFilter;
  onChange: (filter: QueueJobFilter) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QueueFilterBar({ filter, onChange }: QueueFilterBarProps) {
  const { data: instances } = useWorkerInstances();
  const { data: pipelines } = usePipelines();

  const toggleStatus = useCallback(
    (statusId: number) => {
      const current = filter.status_ids ?? [];
      const next = current.includes(statusId)
        ? current.filter((s) => s !== statusId)
        : [...current, statusId];
      onChange({ ...filter, status_ids: next.length > 0 ? next : undefined });
    },
    [filter, onChange],
  );

  const setWorker = useCallback(
    (value: string) => {
      onChange({
        ...filter,
        instance_id: value ? Number(value) : undefined,
      });
    },
    [filter, onChange],
  );

  const setJobType = useCallback(
    (value: string) => {
      onChange({ ...filter, job_type: value || undefined });
    },
    [filter, onChange],
  );

  const setPipeline = useCallback(
    (value: string) => {
      onChange({ ...filter, pipeline_id: value ? Number(value) : undefined });
    },
    [filter, onChange],
  );

  const clearAll = useCallback(() => {
    onChange({ limit: filter.limit, offset: 0 });
  }, [filter.limit, onChange]);

  const hasActiveFilters =
    (filter.status_ids && filter.status_ids.length > 0) ||
    filter.instance_id != null ||
    !!filter.job_type ||
    filter.pipeline_id != null;

  const workerOptions = [
    { label: "All Workers", value: "" },
    ...(instances?.map((i) => ({ label: i.name, value: String(i.id) })) ?? []),
  ];

  return (
    <div className={`${TERMINAL_PANEL}`}>
      <div className={`${TERMINAL_BODY} space-y-3`}>
      <Stack direction="horizontal" gap={4} align="center" className="flex-wrap">
        <Stack direction="horizontal" gap={1} align="center">
          <ListFilter size={iconSizes.sm} className="text-[var(--color-text-muted)]" />
          <span className={TERMINAL_LABEL}>
            Filters
          </span>
        </Stack>

        {/* Status checkboxes */}
        <Stack direction="horizontal" gap={2} align="center" className="flex-wrap">
          {FILTERABLE_STATUSES.map((statusId) => (
            <Checkbox
              key={statusId}
              label={statusLabel(statusId)}
              checked={filter.status_ids?.includes(statusId) ?? false}
              onChange={() => toggleStatus(statusId)}
            />
          ))}
        </Stack>

        {/* Worker dropdown */}
        <Select
          label=""
          size="sm"
          value={filter.instance_id != null ? String(filter.instance_id) : ""}
          onChange={setWorker}
          options={workerOptions}
        />

        {/* Job type dropdown */}
        <Select
          label=""
          size="sm"
          value={filter.job_type ?? ""}
          onChange={setJobType}
          options={JOB_TYPES.map((jt) => ({ label: jt.label, value: jt.value }))}
        />

        {/* Pipeline dropdown */}
        <Select
          label=""
          size="sm"
          value={filter.pipeline_id != null ? String(filter.pipeline_id) : ""}
          onChange={setPipeline}
          options={[
            { label: "All Pipelines", value: "" },
            ...(pipelines?.map((p) => ({ label: p.name, value: String(p.id) })) ?? []),
          ]}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            icon={<X size={iconSizes.sm} />}
            onClick={clearAll}
          >
            Clear
          </Button>
        )}
      </Stack>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <Stack direction="horizontal" gap={1} align="center" className="flex-wrap">
          {filter.status_ids?.map((statusId) => (
            <RemovableChip
              key={statusId}
              label={statusLabel(statusId)}
              onRemove={() => toggleStatus(statusId)}
            />
          ))}
          {filter.instance_id != null && (
            <RemovableChip
              label={`Worker: ${instances?.find((i) => i.id === filter.instance_id)?.name ?? filter.instance_id}`}
              onRemove={() => onChange({ ...filter, instance_id: undefined })}
            />
          )}
          {filter.job_type && (
            <RemovableChip
              label={`Type: ${filter.job_type}`}
              onRemove={() => onChange({ ...filter, job_type: undefined })}
            />
          )}
          {filter.pipeline_id != null && (
            <RemovableChip
              label={`Pipeline: ${pipelines?.find((p) => p.id === filter.pipeline_id)?.name ?? filter.pipeline_id}`}
              onRemove={() => onChange({ ...filter, pipeline_id: undefined })}
            />
          )}
        </Stack>
      )}
      </div>
    </div>
  );
}
