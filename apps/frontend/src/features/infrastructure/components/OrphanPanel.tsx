/**
 * Panel for scanning and cleaning up orphaned cloud/DB/ComfyUI resources.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { CollapsibleSection } from "@/components/composite";
import { Stack } from "@/components/layout";
import { EmptyState } from "@/components/domain";
import { ScanSearch, Trash2, Download, RefreshCw } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatCents } from "@/lib/format";

import {
  useOrphanScan,
  useOrphanCleanup,
} from "../hooks/use-infrastructure-ops";
import type {
  OrphanScanResult,
  CloudOrphanAction,
  DbOrphanAction,
} from "../types";

export function OrphanPanel() {
  const orphanScan = useOrphanScan();
  const orphanCleanup = useOrphanCleanup();
  const [scanResult, setScanResult] = useState<OrphanScanResult | null>(null);

  function handleScan() {
    orphanScan.mutate(undefined, {
      onSuccess: (result) => setScanResult(result),
    });
  }

  const totalOrphans = scanResult
    ? scanResult.cloud_orphans.length +
      scanResult.db_orphans.length +
      scanResult.comfyui_orphans.length
    : 0;

  return (
    <CollapsibleSection
      title="Orphan Detection"
      description="Scan for cloud instances, DB records, or ComfyUI registrations that are out of sync."
      defaultOpen={false}
      card
    >
      <Stack gap={4}>
        <Button
          variant="secondary"
          size="sm"
          icon={<ScanSearch size={iconSizes.sm} />}
          onClick={handleScan}
          loading={orphanScan.isPending}
        >
          {orphanScan.isPending ? "Scanning..." : "Scan for Orphans"}
        </Button>

        {scanResult && totalOrphans === 0 && (
          <EmptyState
            icon={<ScanSearch size={iconSizes.xl} />}
            title="No orphans found"
            description="All cloud instances, DB records, and ComfyUI registrations are in sync."
          />
        )}

        {scanResult && totalOrphans > 0 && (
          <OrphanResults result={scanResult} cleanup={orphanCleanup} />
        )}
      </Stack>
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Orphan results sub-component
   -------------------------------------------------------------------------- */

interface OrphanResultsProps {
  result: OrphanScanResult;
  cleanup: ReturnType<typeof useOrphanCleanup>;
}

function OrphanResults({ result, cleanup }: OrphanResultsProps) {
  function handleCleanupAll() {
    cleanup.mutate({
      cloud_orphans: result.cloud_orphans.map((o) => ({
        external_id: o.external_id,
        provider_id: o.provider_id,
        action: "terminate" as const,
      })),
      db_orphans: result.db_orphans.map((o) => ({
        instance_id: o.instance_id,
        action: "remove" as const,
      })),
      comfyui_orphans: result.comfyui_orphans.map((o) => o.comfyui_instance_id),
    });
  }

  function handleCloudAction(
    externalId: string,
    providerId: number,
    action: CloudOrphanAction["action"],
  ) {
    cleanup.mutate({
      cloud_orphans: [{ external_id: externalId, provider_id: providerId, action }],
      db_orphans: [],
      comfyui_orphans: [],
    });
  }

  function handleDbAction(
    instanceId: number,
    action: DbOrphanAction["action"],
  ) {
    cleanup.mutate({
      cloud_orphans: [],
      db_orphans: [{ instance_id: instanceId, action }],
      comfyui_orphans: [],
    });
  }

  function handleComfyuiRemove(comfyuiInstanceId: number) {
    cleanup.mutate({
      cloud_orphans: [],
      db_orphans: [],
      comfyui_orphans: [comfyuiInstanceId],
    });
  }

  return (
    <Stack gap={4}>
      {/* Cloud orphans */}
      {result.cloud_orphans.length > 0 && (
        <OrphanSection title="Cloud Orphans" count={result.cloud_orphans.length}>
          {result.cloud_orphans.map((o) => (
            <div
              key={o.external_id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono text-[var(--color-text-secondary)] truncate">
                  {o.name ?? o.external_id}
                </span>
                <span className="text-[var(--color-text-muted)] ml-2">
                  {o.provider_name} - {o.status}
                  {o.cost_per_hour_cents != null && (
                    <> ({formatCents(o.cost_per_hour_cents)}/hr)</>
                  )}
                </span>
              </div>
              <Stack direction="horizontal" gap={1}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Download size={iconSizes.sm} />}
                  onClick={() => handleCloudAction(o.external_id, o.provider_id, "import")}
                  disabled={cleanup.isPending}
                >
                  Import
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={iconSizes.sm} />}
                  onClick={() => handleCloudAction(o.external_id, o.provider_id, "terminate")}
                  disabled={cleanup.isPending}
                >
                  Terminate
                </Button>
              </Stack>
            </div>
          ))}
        </OrphanSection>
      )}

      {/* DB orphans */}
      {result.db_orphans.length > 0 && (
        <OrphanSection title="DB Orphans" count={result.db_orphans.length}>
          {result.db_orphans.map((o) => (
            <div
              key={o.instance_id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono text-[var(--color-text-secondary)]">
                  {o.external_id}
                </span>
                <span className="text-[var(--color-text-muted)] ml-2">
                  DB: {o.db_status} / Actual: {o.actual_status}
                </span>
              </div>
              <Stack direction="horizontal" gap={1}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw size={iconSizes.sm} />}
                  onClick={() => handleDbAction(o.instance_id, "resync")}
                  disabled={cleanup.isPending}
                >
                  Resync
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={iconSizes.sm} />}
                  onClick={() => handleDbAction(o.instance_id, "remove")}
                  disabled={cleanup.isPending}
                >
                  Remove
                </Button>
              </Stack>
            </div>
          ))}
        </OrphanSection>
      )}

      {/* ComfyUI orphans */}
      {result.comfyui_orphans.length > 0 && (
        <OrphanSection title="ComfyUI Orphans" count={result.comfyui_orphans.length}>
          {result.comfyui_orphans.map((o) => (
            <div
              key={o.comfyui_instance_id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono text-[var(--color-text-secondary)]">
                  {o.name}
                </span>
                <span className="text-[var(--color-text-muted)] ml-2">
                  {o.reason}
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={iconSizes.sm} />}
                onClick={() => handleComfyuiRemove(o.comfyui_instance_id)}
                disabled={cleanup.isPending}
              >
                Remove
              </Button>
            </div>
          ))}
        </OrphanSection>
      )}

      {/* Bulk cleanup button */}
      <Button
        variant="danger"
        size="sm"
        icon={<Trash2 size={iconSizes.sm} />}
        onClick={handleCleanupAll}
        loading={cleanup.isPending}
      >
        Clean Up All Orphans
      </Button>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Section wrapper
   -------------------------------------------------------------------------- */

function OrphanSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-cyan-400 font-mono">
          {title}
        </span>
        <span className="text-[10px] text-orange-400 font-mono">
          ({count})
        </span>
      </div>
      <Stack gap={2}>{children}</Stack>
    </div>
  );
}
