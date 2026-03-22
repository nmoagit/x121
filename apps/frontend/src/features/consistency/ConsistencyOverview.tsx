/**
 * Project-wide consistency overview (PRD-94).
 *
 * Shows a summary of how many avatars are fully consistent and
 * lists per-avatar rows with overall score and click-through.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import { ConsistencyReportCard } from "./ConsistencyReportCard";
import { CONSISTENCY_THRESHOLDS, type ConsistencyReport, type ConsistencyReportType } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

interface AvatarEntry {
  avatarId: number;
  avatarName: string;
  report: ConsistencyReport | null;
}

function countConsistent(entries: AvatarEntry[]): number {
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
  avatars: AvatarEntry[];
  isGenerating?: boolean;
  onGenerate?: (avatarId: number, reportType: ConsistencyReportType) => void;
  onAvatarClick?: (avatarId: number) => void;
}

export function ConsistencyOverview({
  avatars,
  isGenerating = false,
  onGenerate,
  onAvatarClick,
}: ConsistencyOverviewProps) {
  const consistentCount = countConsistent(avatars);
  const totalCount = avatars.length;

  return (
    <div data-testid="consistency-overview">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium text-[var(--color-text-primary)]">
              Avatar Consistency
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
          {avatars.length === 0 && (
            <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
              No avatars in this project.
            </p>
          )}
          <div className="space-y-2 py-2">
            {avatars.map((entry) => (
              <ConsistencyReportCard
                key={entry.avatarId}
                avatarName={entry.avatarName}
                report={entry.report}
                isGenerating={isGenerating}
                onGenerate={(reportType) =>
                  onGenerate?.(entry.avatarId, reportType)
                }
                onClick={
                  entry.report
                    ? () => onAvatarClick?.(entry.avatarId)
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
