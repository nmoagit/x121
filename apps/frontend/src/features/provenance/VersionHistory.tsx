/**
 * Version history / asset usage timeline component (PRD-69).
 *
 * Shows which segments used a given asset, ordered by date descending.
 * This is the "reverse provenance" view.
 */

import { Spinner } from "@/components";
import { Card, CardBody, CardHeader } from "@/components";
import { formatDate } from "@/lib/format";

import { useAssetUsage } from "./hooks/use-provenance";
import type { AssetUsageEntry } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface VersionHistoryProps {
  assetId: number;
  version?: string;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function UsageEntryRow({ entry }: { entry: AssetUsageEntry }) {
  const formattedDate = formatDate(entry.created_at);
  const formattedTime = new Date(entry.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="flex items-start gap-3 py-3"
      data-testid={`usage-entry-${entry.segment_id}`}
    >
      {/* Timeline dot */}
      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-action-primary)]" />

      <div className="flex flex-1 items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-[var(--color-text-primary)]">
            Segment #{entry.segment_id}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            Scene #{entry.scene_id}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">
            {formattedDate}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {formattedTime}
          </span>
          <span className="text-xs font-mono text-[var(--color-text-secondary)]">
            v{entry.model_version}
          </span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VersionHistory({ assetId, version }: VersionHistoryProps) {
  const { data: entries, isLoading, isError } = useAssetUsage(assetId, version);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6" data-testid="usage-loading">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="p-4 text-sm text-[var(--color-action-danger)]"
        data-testid="usage-error"
      >
        Failed to load asset usage history.
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div
        className="p-4 text-sm text-[var(--color-text-muted)] text-center"
        data-testid="usage-empty"
      >
        No segments have used this asset yet.
      </div>
    );
  }

  return (
    <Card data-testid="version-history">
      <CardHeader>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Asset Usage History ({entries.length})
        </h3>
      </CardHeader>
      <CardBody>
        <div
          className="divide-y divide-[var(--color-border-default)]"
          data-testid="usage-timeline"
        >
          {entries.map((entry) => (
            <UsageEntryRow
              key={`${entry.segment_id}-${entry.created_at}`}
              entry={entry}
            />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
