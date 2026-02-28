/**
 * Temporal continuity analysis page (PRD-26).
 *
 * Allows selecting a scene to view drift trend charts and grain
 * comparison panels for the scene's temporal metrics.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button, Input, Spinner } from "@/components/primitives";

import {
  DriftTrendChart,
  GrainComparisonPanel,
  useNormalizeGrain,
  useSceneTemporalMetrics,
} from "@/features/temporal";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TemporalPage() {
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedSegmentIdx, setSelectedSegmentIdx] = useState<number | null>(null);

  const { data: summary, isLoading } = useSceneTemporalMetrics(sceneId ?? 0);
  const normalizeGrain = useNormalizeGrain();

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setSceneId(parsed);
      setSelectedSegmentIdx(null);
    }
  };

  const metrics = summary?.metrics ?? [];
  const driftTrend = summary?.drift_trend ?? "stable";
  const selectedMetric = selectedSegmentIdx !== null ? metrics[selectedSegmentIdx] : null;

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Temporal Analysis
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Analyze drift, centering, and grain consistency across scene segments.
          </p>
        </div>

        {/* Scene selector */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Scene ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter scene ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {/* Loading */}
        {sceneId !== null && isLoading && (
          <Stack align="center" gap={3}>
            <Spinner size="lg" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Loading temporal metrics...
            </p>
          </Stack>
        )}

        {/* Drift trend chart */}
        {sceneId !== null && !isLoading && (
          <DriftTrendChart metrics={metrics} driftTrend={driftTrend} isLoading={false} />
        )}

        {/* Segment selector */}
        {metrics.length > 0 && (
          <Stack gap={2}>
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
              Select a segment for grain comparison
            </h2>
            <div className="flex flex-wrap gap-2">
              {metrics.map((m, idx) => (
                <Button
                  key={m.segment_id}
                  size="sm"
                  variant={selectedSegmentIdx === idx ? "primary" : "ghost"}
                  onClick={() => setSelectedSegmentIdx(idx)}
                >
                  Segment #{m.segment_id}
                </Button>
              ))}
            </div>
          </Stack>
        )}

        {/* Grain comparison panel */}
        {selectedMetric && (
          <GrainComparisonPanel
            metric={selectedMetric}
            onNormalize={() =>
              normalizeGrain.mutate({
                segmentId: selectedMetric.segment_id,
                original_variance: selectedMetric.grain_variance ?? 0,
                normalized_variance: 0,
                new_match_score: 1.0,
              })
            }
            isNormalizing={normalizeGrain.isPending}
          />
        )}

        {/* Empty state */}
        {sceneId === null && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a scene ID above to view temporal continuity data.
          </p>
        )}
      </Stack>
    </div>
  );
}
