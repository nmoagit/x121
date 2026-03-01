/**
 * Worker integrity & repair tools page (PRD-43).
 *
 * Renders the WorkerHealthDashboard (constructed from the worker report hook),
 * a ScanHistory table, and the ModelChecksumManager CRUD panel.
 * All data is fetched via the integrity feature hooks.
 */

import { PageHeader, Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";

import {
  ModelChecksumManager,
  ScanHistory,
  WorkerHealthDashboard,
  useCreateChecksum,
  useDeleteChecksum,
  useIntegrityScans,
  useModelChecksums,
  useRepairWorker,
  useStartScan,
} from "@/features/integrity";
import type { IntegrityScan } from "@/features/integrity";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function IntegrityPage() {
  const { data: scans, isLoading: scansLoading } = useIntegrityScans();
  const { data: checksums, isLoading: checksumsLoading } = useModelChecksums();

  const startScan = useStartScan();
  const repairWorker = useRepairWorker();
  const createChecksum = useCreateChecksum();
  const deleteChecksum = useDeleteChecksum();

  const isLoading = scansLoading || checksumsLoading;

  /* Build WorkerHealthDashboard data from scans --------------------------  */

  const workerMap = new Map<
    number,
    { workerId: number; workerName: string; latestScan: IntegrityScan; healthStatus: string }
  >();

  if (scans) {
    for (const scan of scans) {
      const existing = workerMap.get(scan.worker_id);
      if (!existing || new Date(scan.created_at) > new Date(existing.latestScan.created_at)) {
        const health =
          scan.models_corrupted > 0 || scan.nodes_missing > 2
            ? "critical"
            : scan.models_missing > 0 || scan.nodes_missing > 0
              ? "warning"
              : "healthy";

        workerMap.set(scan.worker_id, {
          workerId: scan.worker_id,
          workerName: `Worker ${scan.worker_id}`,
          latestScan: scan,
          healthStatus: health,
        });
      }
    }
  }

  const workers = [...workerMap.values()].map((w) => ({
    ...w,
    onStartScan: (workerId: number, scanType: string) =>
      startScan.mutate({ worker_id: workerId, scan_type: scanType }),
    onRepair: (workerId: number) => repairWorker.mutate(workerId),
  }));

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Worker Integrity"
          description="Monitor worker health status, model checksums, and integrity scan results."
        />

        {isLoading && <LoadingPane />}

        {!isLoading && (
          <>
            <WorkerHealthDashboard workers={workers} />

            <ScanHistory scans={scans ?? []} />

            <ModelChecksumManager
              checksums={checksums ?? []}
              onCreateChecksum={(input) => createChecksum.mutate(input)}
              onDeleteChecksum={(id) => deleteChecksum.mutate(id)}
            />
          </>
        )}
      </Stack>
    </div>
  );
}
