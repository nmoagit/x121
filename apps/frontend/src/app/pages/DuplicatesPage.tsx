/**
 * Character duplicate detection page (PRD-79).
 *
 * Shows duplicate detection settings, a batch check trigger,
 * and a grid of flagged duplicate pairs with resolution controls.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button, Spinner } from "@/components/primitives";

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
      { character_ids: [] },
      {
        onSuccess: (checks) => {
          const pairs: FlaggedPair[] = checks
            .filter((c) => c.matched_character_id !== null)
            .map((c) => ({
              checkId: c.id,
              characterAName: `Character #${c.source_character_id}`,
              characterBName: `Character #${c.matched_character_id}`,
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
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Duplicate Detection
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Configure similarity thresholds and resolve flagged duplicate
            characters.
          </p>
        </div>

        {/* Settings */}
        {settingsLoading && (
          <Stack align="center" gap={3}>
            <Spinner size="lg" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Loading settings...
            </p>
          </Stack>
        )}

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
          {batchCheck.isPending && <Spinner size="sm" />}
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
