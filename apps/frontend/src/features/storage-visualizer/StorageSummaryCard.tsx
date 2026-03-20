/**
 * Summary statistics card for the Storage Visualizer (PRD-19).
 *
 * Displays total size, file count, reclaimable bytes, reclaimable
 * percentage, a refresh button, and the last snapshot timestamp.
 */

import { Card, CardBody } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, StatBadge ,  WireframeLoader } from "@/components/primitives";
import { formatBytes, formatDateTime, formatPercent } from "@/lib/format";
import { RefreshCw } from "@/tokens/icons";

import {
  useRefreshSnapshots,
  useStorageSummary,
} from "./hooks/use-storage-visualizer";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StorageSummaryCard() {
  const { data: summary, isLoading } = useStorageSummary();
  const refresh = useRefreshSnapshots();

  if (isLoading) {
    return (
      <Card elevation="sm">
        <CardBody>
          <div className="flex h-24 items-center justify-center">
            <WireframeLoader size={48} />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card elevation="sm">
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No storage snapshot available.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card elevation="sm">
      <CardBody>
        <Stack direction="vertical" gap={4}>
          <Stack direction="horizontal" gap={3} align="center" justify="between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Storage Overview
            </h2>
            <Stack direction="horizontal" gap={2} align="center">
              {summary.snapshot_at && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Snapshot: {formatDateTime(summary.snapshot_at)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} />}
                loading={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBadge label="Total Size" value={formatBytes(summary.total_bytes)} />
            <StatBadge label="Files" value={summary.total_files.toLocaleString()} />
            <StatBadge
              label="Reclaimable"
              value={formatBytes(summary.reclaimable_bytes)}
            />
            <StatBadge
              label="Reclaimable %"
              value={formatPercent(summary.reclaimable_percentage)}
            />
          </div>
        </Stack>
      </CardBody>
    </Card>
  );
}
