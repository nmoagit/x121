/**
 * BatchDuplicateGrid -- grid of flagged duplicate pairs (PRD-79).
 *
 * Shows all flagged pairs from a batch check with per-pair similarity
 * scores and resolution controls.
 */

import { useCallback, useState } from "react";

import { Badge, Button, Select } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface FlaggedPair {
  checkId: number;
  characterAName: string;
  characterBName: string;
  similarityScore: number;
}

interface BatchDuplicateGridProps {
  pairs: FlaggedPair[];
  onResolve: (checkId: number, resolution: string) => void;
}

/* --------------------------------------------------------------------------
   Resolution options
   -------------------------------------------------------------------------- */

const RESOLUTION_OPTIONS = [
  { value: "merge", label: "Merge" },
  { value: "dismiss", label: "Dismiss" },
  { value: "create_new", label: "Create as New" },
  { value: "skip", label: "Skip" },
];

/* --------------------------------------------------------------------------
   Pair card
   -------------------------------------------------------------------------- */

function PairCard({
  pair,
  onResolve,
}: {
  pair: FlaggedPair;
  onResolve: (checkId: number, resolution: string) => void;
}) {
  const [resolution, setResolution] = useState("");

  const handleResolve = useCallback(() => {
    if (!resolution) return;
    onResolve(pair.checkId, resolution);
  }, [pair.checkId, resolution, onResolve]);

  return (
    <div data-testid={`pair-card-${pair.checkId}`}>
    <Card
      elevation="flat"
      className="p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span
              className="font-medium text-[var(--color-text-primary)]"
              data-testid={`pair-a-${pair.checkId}`}
            >
              {pair.characterAName}
            </span>
            <span className="text-[var(--color-text-muted)]">vs</span>
            <span
              className="font-medium text-[var(--color-text-primary)]"
              data-testid={`pair-b-${pair.checkId}`}
            >
              {pair.characterBName}
            </span>
          </div>
          <Badge variant={pair.similarityScore >= 95 ? "danger" : "warning"}>
            {pair.similarityScore.toFixed(1)}%
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={resolution}
            onChange={(val) => setResolution(val)}
            options={RESOLUTION_OPTIONS}
            placeholder="Select..."
            label={`Resolution for ${pair.characterAName} vs ${pair.characterBName}`}
          />
          <Button
            onClick={handleResolve}
            disabled={!resolution}
            aria-label={`Apply resolution for pair ${pair.checkId}`}
          >
            Apply
          </Button>
        </div>
      </div>
    </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function BatchDuplicateGrid({
  pairs,
  onResolve,
}: BatchDuplicateGridProps) {
  return (
    <Card elevation="flat" data-testid="batch-duplicate-grid">
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Flagged Duplicates ({pairs.length})
        </h3>
      </CardHeader>
      <CardBody>
        {pairs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No duplicates found.
          </p>
        ) : (
          <div
            className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            data-testid="pairs-grid"
          >
            {pairs.map((pair) => (
              <PairCard
                key={pair.checkId}
                pair={pair}
                onResolve={onResolve}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
