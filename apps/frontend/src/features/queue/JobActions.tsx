/**
 * Job action controls (PRD-132).
 *
 * Per-row action dropdown and bulk action toolbar for queue management.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { Dropdown } from "@/components/composite";
import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import {
  Ban,
  ArrowRightLeft,
  Pause,
  Play,
  ChevronUp,
  XCircle,
} from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useCancelJob,
  useHoldJob,
  useReleaseJob,
  useMoveToFront,
  useReassignJob,
  useBulkCancel,
  useWorkerInstances,
} from "./hooks/use-queue";
import type { FullQueueJob } from "./types";
import {
  JOB_STATUS_RUNNING,
  JOB_STATUS_PAUSED,
  JOB_STATUS_HELD,
  JOB_STATUS_PENDING,
  JOB_STATUS_QUEUED,
} from "./types";

/* --------------------------------------------------------------------------
   Per-row action dropdown
   -------------------------------------------------------------------------- */

interface JobActionMenuProps {
  job: FullQueueJob;
}

export function JobActionMenu({ job }: JobActionMenuProps) {
  const cancelJob = useCancelJob();
  const holdJob = useHoldJob();
  const releaseJob = useReleaseJob();
  const moveToFront = useMoveToFront();
  const [reassignOpen, setReassignOpen] = useState(false);

  const isPendingOrQueued = job.status_id === JOB_STATUS_PENDING || job.status_id === JOB_STATUS_QUEUED;
  const isHeld = job.status_id === JOB_STATUS_HELD;
  const isRunning = job.status_id === JOB_STATUS_RUNNING;
  const isPaused = job.status_id === JOB_STATUS_PAUSED;
  const isActive = isPendingOrQueued || isRunning || isPaused || isHeld;

  const items = [
    ...(isPendingOrQueued
      ? [{ label: "Move to Front", value: "front", icon: <ChevronUp size={iconSizes.sm} /> }]
      : []),
    ...(isHeld
      ? [{ label: "Release", value: "release", icon: <Play size={iconSizes.sm} /> }]
      : isPendingOrQueued
        ? [{ label: "Hold", value: "hold", icon: <Pause size={iconSizes.sm} /> }]
        : []),
    ...(isActive
      ? [{ label: "Reassign", value: "reassign", icon: <ArrowRightLeft size={iconSizes.sm} /> }]
      : []),
    ...(isActive
      ? [{ label: "Cancel", value: "cancel", icon: <XCircle size={iconSizes.sm} />, danger: true }]
      : []),
  ];

  if (items.length === 0) return null;

  const handleSelect = (value: string) => {
    switch (value) {
      case "front":
        moveToFront.mutate(job.id);
        break;
      case "hold":
        holdJob.mutate(job.id);
        break;
      case "release":
        releaseJob.mutate(job.id);
        break;
      case "reassign":
        setReassignOpen(true);
        break;
      case "cancel":
        cancelJob.mutate(job.id);
        break;
    }
  };

  return (
    <>
      <Dropdown
        trigger={
          <Button variant="ghost" size="sm">
            Actions
          </Button>
        }
        items={items}
        onSelect={handleSelect}
        align="right"
      />
      <ReassignModal
        jobId={job.id}
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
      />
    </>
  );
}

/* --------------------------------------------------------------------------
   Reassign modal
   -------------------------------------------------------------------------- */

function ReassignModal({
  jobId,
  open,
  onClose,
}: {
  jobId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data: instances } = useWorkerInstances();
  const reassignJob = useReassignJob();

  const handleReassign = (instanceId: number) => {
    reassignJob.mutate({ jobId, instanceId }, { onSuccess: onClose });
  };

  return (
    <Modal open={open} onClose={onClose} title="Reassign Job" size="sm">
      <div className="space-y-2">
        <p className="text-sm text-[var(--color-text-muted)]">
          Select a worker instance to reassign job #{jobId}:
        </p>
        {instances?.map((inst) => (
          <Button
            key={inst.id}
            variant="secondary"
            size="sm"
            className="w-full justify-start"
            onClick={() => handleReassign(inst.id)}
            disabled={reassignJob.isPending || !inst.is_enabled}
          >
            <span className="flex items-center gap-2">
              <span>{inst.name}</span>
              {!inst.is_enabled && (
                <span className="text-xs text-[var(--color-text-muted)]">(disabled)</span>
              )}
            </span>
          </Button>
        ))}
        {(!instances || instances.length === 0) && (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
            No worker instances available
          </p>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Bulk action toolbar
   -------------------------------------------------------------------------- */

interface BulkActionToolbarProps {
  selectedJobIds: number[];
  onClearSelection: () => void;
}

export function BulkActionToolbar({ selectedJobIds, onClearSelection }: BulkActionToolbarProps) {
  const bulkCancel = useBulkCancel();

  if (selectedJobIds.length === 0) return null;

  const handleBulkCancel = () => {
    bulkCancel.mutate(
      { status_ids: [JOB_STATUS_PENDING, JOB_STATUS_QUEUED, JOB_STATUS_RUNNING] },
      { onSuccess: onClearSelection },
    );
  };

  return (
    <Stack
      direction="horizontal"
      gap={3}
      align="center"
      className="px-4 py-2 bg-[var(--color-surface-tertiary)] rounded-[var(--radius-md)]"
    >
      <span className="text-sm text-[var(--color-text-primary)]">
        {selectedJobIds.length} selected
      </span>
      <Button
        variant="danger"
        size="sm"
        icon={<Ban size={iconSizes.sm} />}
        onClick={handleBulkCancel}
        disabled={bulkCancel.isPending}
      >
        Bulk Cancel
      </Button>
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        Clear Selection
      </Button>
    </Stack>
  );
}
