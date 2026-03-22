/**
 * Storage Visualizer admin page (PRD-19).
 *
 * Layout: summary at top, treemap in center, breakdown sidebar on the right.
 */

import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

import { FileTypeBreakdownChart } from "./FileTypeBreakdownChart";
import { StorageSummaryCard } from "./StorageSummaryCard";
import { StorageTreemap } from "./StorageTreemap";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StorageVisualizerPage() {
  useSetPageTitle("Storage Visualizer", "Browse and manage storage usage across projects.");
  return (
    <Stack direction="vertical" gap={4} className="p-[var(--spacing-4)]">
      {/* Summary cards */}
      <StorageSummaryCard />

      {/* Treemap + breakdown side-by-side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StorageTreemap />
        </div>
        <div>
          <FileTypeBreakdownChart />
        </div>
      </div>
    </Stack>
  );
}
