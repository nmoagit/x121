import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/composite/Card";
import { Stack } from "@/components/layout";

import type { EnrichedTemporalMetric, GrainQuality } from "./types";
import { grainBadgeVariant } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GrainComparisonPanelProps {
  metric: EnrichedTemporalMetric;
  onNormalize?: () => void;
  isNormalizing?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GrainComparisonPanel({
  metric,
  onNormalize,
  isNormalizing = false,
}: GrainComparisonPanelProps) {
  const matchScore = metric.grain_match_score;
  const variance = metric.grain_variance;
  const quality = metric.grain_quality as GrainQuality | null;

  return (
    <Card padding="md">
      <Stack gap={3}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Grain Comparison
          </h4>
          {quality && (
            <Badge variant={grainBadgeVariant(quality)}>
              {quality.charAt(0).toUpperCase() + quality.slice(1)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Match Score
            </p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {matchScore != null ? `${(matchScore * 100).toFixed(1)}%` : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Grain Variance
            </p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {variance != null ? variance.toFixed(4) : "N/A"}
            </p>
          </div>
        </div>

        {onNormalize && quality !== "good" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onNormalize}
            disabled={isNormalizing}
          >
            {isNormalizing ? "Normalizing..." : "Normalize Grain"}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
