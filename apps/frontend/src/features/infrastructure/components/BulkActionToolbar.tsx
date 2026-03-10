/**
 * Sticky toolbar that appears when instances are multi-selected.
 *
 * Provides bulk Start / Stop / Terminate actions.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { ConfirmDeleteModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Play, Square, Trash2, X } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useBulkStart,
  useBulkStop,
  useBulkTerminate,
} from "../hooks/use-infrastructure-ops";

interface BulkActionToolbarProps {
  selectedIds: Set<number>;
  onDeselectAll: () => void;
}

export function BulkActionToolbar({
  selectedIds,
  onDeselectAll,
}: BulkActionToolbarProps) {
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);

  const bulkStart = useBulkStart();
  const bulkStop = useBulkStop();
  const bulkTerminate = useBulkTerminate();

  const count = selectedIds.size;
  if (count === 0) return null;

  const ids = Array.from(selectedIds);
  const isBusy =
    bulkStart.isPending || bulkStop.isPending || bulkTerminate.isPending;

  return (
    <>
      <div className="sticky top-0 z-10 bg-[var(--color-surface-tertiary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] px-4 py-2">
        <Stack direction="horizontal" gap={3} align="center" justify="between">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {count} instance{count !== 1 ? "s" : ""} selected
          </span>

          <Stack direction="horizontal" gap={2}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Play size={iconSizes.sm} />}
              onClick={() => bulkStart.mutate({ instance_ids: ids })}
              disabled={isBusy}
              loading={bulkStart.isPending}
            >
              Start
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Square size={iconSizes.sm} />}
              onClick={() => bulkStop.mutate({ instance_ids: ids })}
              disabled={isBusy}
              loading={bulkStop.isPending}
            >
              Stop
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={() => setShowTerminateConfirm(true)}
              disabled={isBusy}
            >
              Terminate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={iconSizes.sm} />}
              onClick={onDeselectAll}
            >
              Clear
            </Button>
          </Stack>
        </Stack>
      </div>

      <ConfirmDeleteModal
        open={showTerminateConfirm}
        onClose={() => setShowTerminateConfirm(false)}
        title="Terminate Instances"
        entityName={`${count} instance${count !== 1 ? "s" : ""}`}
        warningText="All selected instances will be permanently destroyed. This cannot be undone."
        onConfirm={() => {
          bulkTerminate.mutate({ instance_ids: ids });
          setShowTerminateConfirm(false);
          onDeselectAll();
        }}
        loading={bulkTerminate.isPending}
      />
    </>
  );
}
