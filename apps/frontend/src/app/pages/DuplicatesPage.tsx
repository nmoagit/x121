/**
 * Avatar duplicate detection page (PRD-79).
 *
 * Shows duplicate detection settings, a batch check trigger,
 * and a grid of flagged duplicate pairs with resolution controls.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, LoadingPane ,  ContextLoader } from "@/components/primitives";

import {
  BatchDuplicateGrid,
  ThresholdSettings,
  useBatchCheck,
  useDuplicateSettings,
  useResolveCheck,
  useUpdateDuplicateSettings,
} from "@/features/duplicates";
import type { FlaggedPair } from "@/features/duplicates";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DuplicatesPage() {
  const { data: settings, isLoading: settingsLoading } =
    useDuplicateSettings();
  const updateSettings = useUpdateDuplicateSettings();
  const batchCheck = useBatchCheck();
  const resolveCheck = useResolveCheck();

  const [flaggedPairs, setFlaggedPairs] = useState<FlaggedPair[]>([]);

  const handleBatchCheck = () => {
    batchCheck.mutate(
      { avatar_ids: [] },
      {
        onSuccess: (checks) => {
          const pairs: FlaggedPair[] = checks
            .filter((c) => c.matched_avatar_id !== null)
            .map((c) => ({
              checkId: c.id,
              avatarAName: `Avatar #${c.source_avatar_id}`,
              avatarBName: `Avatar #${c.matched_avatar_id}`,
              similarityScore: (c.similarity_score ?? 0) * 100,
            }));
          setFlaggedPairs(pairs);
        },
      },
    );
  };

  const handleResolve = (checkId: number, resolution: string) => {
    resolveCheck.mutate(
      { id: checkId, resolution },
      {
        onSuccess: () => {
          setFlaggedPairs((prev) =>
            prev.filter((p) => p.checkId !== checkId),
          );
        },
      },
    );
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Duplicate Detection"
          description="Configure similarity thresholds and resolve flagged duplicate avatars."
        />

        {/* Settings */}
        {settingsLoading && <LoadingPane />}

        {settings && (
          <ThresholdSettings
            settings={settings}
            onSave={(input) => updateSettings.mutate(input)}
          />
        )}

        {/* Batch check trigger */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handleBatchCheck}
            disabled={batchCheck.isPending}
          >
            {batchCheck.isPending ? "Checking..." : "Run Batch Check"}
          </Button>
          {batchCheck.isPending && <ContextLoader size={32} />}
        </div>

        {/* Flagged pairs grid */}
        <BatchDuplicateGrid
          pairs={flaggedPairs}
          onResolve={handleResolve}
        />
      </Stack>
    </div>
  );
}
