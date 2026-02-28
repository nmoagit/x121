/**
 * Single character consistency report card (PRD-94).
 *
 * Displays overall score, outlier count, report type badge, and
 * a generate button when no report exists yet.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody } from "@/components/composite";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

import type { ConsistencyReport, ConsistencyReportType } from "./types";
import {
  consistencyBadgeVariant,
  REPORT_TYPE_BADGE_VARIANT,
  REPORT_TYPE_LABELS,
} from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ConsistencyReportCardProps {
  characterName: string;
  report: ConsistencyReport | null;
  isGenerating?: boolean;
  onGenerate?: (reportType: ConsistencyReportType) => void;
  onClick?: () => void;
}

export function ConsistencyReportCard({
  characterName,
  report,
  isGenerating = false,
  onGenerate,
  onClick,
}: ConsistencyReportCardProps) {
  const hasReport = report !== null;
  const outlierCount = report?.outlier_scene_ids?.length ?? 0;
  const score = report?.overall_consistency_score ?? null;

  return (
    <Card
      padding="none"
      className={cn(onClick && "cursor-pointer hover:border-[var(--color-border-focus)]")}
    >
      <CardBody>
        <div
          data-testid="consistency-report-card"
          className="flex items-center justify-between gap-3"
          onClick={onClick}
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (onClick && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onClick();
            }
          }}
        >
          {/* Left: character name + badges */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {characterName}
            </span>
            {hasReport && (
              <Badge
                variant={REPORT_TYPE_BADGE_VARIANT[report.report_type]}
                size="sm"
              >
                {REPORT_TYPE_LABELS[report.report_type]}
              </Badge>
            )}
          </div>

          {/* Right: score + outlier count or generate button */}
          <div className="flex items-center gap-3 shrink-0">
            {hasReport && score !== null && (
              <>
                <Badge variant={consistencyBadgeVariant(score)} size="sm">
                  {formatPercent(score)}
                </Badge>
                {outlierCount > 0 && (
                  <Badge variant="danger" size="sm">
                    {outlierCount} outlier{outlierCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </>
            )}
            {hasReport && score === null && (
              <span className="text-xs text-[var(--color-text-muted)]">
                Processing...
              </span>
            )}
            {!hasReport && (
              <Button
                variant="secondary"
                size="sm"
                loading={isGenerating}
                data-testid="generate-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate?.("full");
                }}
              >
                Generate
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
