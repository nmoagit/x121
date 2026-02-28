/**
 * Project-wide consistency overview (PRD-94).
 *
 * Shows a summary of how many characters are fully consistent and
 * lists per-character rows with overall score and click-through.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import { ConsistencyReportCard } from "./ConsistencyReportCard";
import { CONSISTENCY_THRESHOLDS, type ConsistencyReport, type ConsistencyReportType } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

interface CharacterEntry {
  characterId: number;
  characterName: string;
  report: ConsistencyReport | null;
}

function countConsistent(entries: CharacterEntry[]): number {
  return entries.filter(
    (e) =>
      e.report !== null &&
      e.report.overall_consistency_score !== null &&
      e.report.overall_consistency_score >= CONSISTENCY_THRESHOLDS.good,
  ).length;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ConsistencyOverviewProps {
  characters: CharacterEntry[];
  isGenerating?: boolean;
  onGenerate?: (characterId: number, reportType: ConsistencyReportType) => void;
  onCharacterClick?: (characterId: number) => void;
}

export function ConsistencyOverview({
  characters,
  isGenerating = false,
  onGenerate,
  onCharacterClick,
}: ConsistencyOverviewProps) {
  const consistentCount = countConsistent(characters);
  const totalCount = characters.length;

  return (
    <div data-testid="consistency-overview">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium text-[var(--color-text-primary)]">
              Character Consistency
            </h2>
            <Badge
              variant={consistentCount === totalCount ? "success" : "warning"}
              size="sm"
            >
              {consistentCount} of {totalCount} consistent
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {characters.length === 0 && (
            <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
              No characters in this project.
            </p>
          )}
          <div className="space-y-2 py-2">
            {characters.map((entry) => (
              <ConsistencyReportCard
                key={entry.characterId}
                characterName={entry.characterName}
                report={entry.report}
                isGenerating={isGenerating}
                onGenerate={(reportType) =>
                  onGenerate?.(entry.characterId, reportType)
                }
                onClick={
                  entry.report
                    ? () => onCharacterClick?.(entry.characterId)
                    : undefined
                }
              />
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
