/**
 * Summary report card component (PRD-72).
 *
 * Displays project summary statistics and provides export links
 * for PDF and JSON downloads.
 */

import { Download } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/composite";
import { API_BASE_URL } from "@/lib/api";
import { formatPercent, formatDateTime } from "@/lib/format";

import { useProjectSummary } from "./hooks/use-project-lifecycle";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SummaryReportCardProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STAT_LABELS = [
  { key: "total_avatars", label: "Avatars" },
  { key: "total_scenes", label: "Total Scenes" },
  { key: "approved_scenes", label: "Approved Scenes" },
  { key: "total_segments", label: "Total Segments" },
  { key: "wall_clock_days", label: "Wall-clock Days" },
  { key: "regeneration_count", label: "Regenerations" },
] as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SummaryReportCard({ projectId }: SummaryReportCardProps) {
  const { data: summary, isLoading } = useProjectSummary(projectId);

  if (isLoading) {
    return (
      <Card>
        <div className="flex justify-center py-[var(--spacing-6)]">
          <WireframeLoader size={48} />
        </div>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            No summary report available. Deliver the project to generate one.
          </p>
        </CardBody>
      </Card>
    );
  }

  const report = summary.report_json;
  const pdfUrl = `${API_BASE_URL}/projects/${projectId}/summary/export/pdf`;
  const jsonUrl = `${API_BASE_URL}/projects/${projectId}/summary/export/json`;

  return (
    <Card data-testid="summary-report-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Summary Report
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            Generated {formatDateTime(summary.generated_at)}
          </span>
        </div>
      </CardHeader>

      <CardBody>
        <dl className="grid grid-cols-2 gap-x-[var(--spacing-6)] gap-y-[var(--spacing-3)]">
          {STAT_LABELS.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
              <dd className="text-lg font-semibold text-[var(--color-text-primary)]">
                {report[key]}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-[var(--color-text-muted)]">QA Pass Rate</dt>
            <dd className="text-lg font-semibold text-[var(--color-text-primary)]">
              {formatPercent(report.qa_pass_rate)}
            </dd>
          </div>
        </dl>
      </CardBody>

      <CardFooter>
        <div className="flex items-center gap-[var(--spacing-3)]">
          <a href={pdfUrl} download>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={iconSizes.sm} />}
            >
              Export PDF
            </Button>
          </a>
          <a href={jsonUrl} download>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={iconSizes.sm} />}
            >
              Export JSON
            </Button>
          </a>
        </div>
      </CardFooter>
    </Card>
  );
}
