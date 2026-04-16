/**
 * Report viewer for Production Reporting (PRD-73).
 *
 * Displays the details and data of a single generated report,
 * including metadata and a download button for completed reports.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { API_BASE_URL } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Download, iconSizes } from "@/tokens/icons";

import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";
import { useReport } from "./hooks/use-reports";
import {
  FORMAT_LABELS,
  REPORT_STATUS_BADGE_VARIANT,
  REPORT_STATUS_LABELS,
  resolveReportStatus,
} from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ReportViewerProps {
  reportId: number | undefined;
}

export function ReportViewer({ reportId }: ReportViewerProps) {
  const { data: report, isLoading } = useReport(reportId);

  if (isLoading) {
    return (
      <div data-testid="report-viewer">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">Loading report...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div data-testid="report-viewer">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Select a report to view its details.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const status = resolveReportStatus(report.status_id);
  const isCompleted = status === "completed";
  const downloadUrl = `${API_BASE_URL}/reports/${report.id}/download`;

  return (
    <div data-testid="report-viewer">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Report #{report.id}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Type {report.report_type_id}
            </p>
          </div>
          {isCompleted && (
            <a href={downloadUrl} data-testid="download-btn">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={iconSizes.sm} />}
              >
                Download
              </Button>
            </a>
          )}
        </CardHeader>

        <CardBody>
          <div className="flex flex-col gap-3">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">Format: </span>
                <span className="text-[var(--color-text-primary)]">
                  {FORMAT_LABELS[report.format]}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Status: </span>
                <Badge variant={REPORT_STATUS_BADGE_VARIANT[status]} size="sm">
                  {REPORT_STATUS_LABELS[status]}
                </Badge>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Date Range: </span>
                <span className="text-[var(--color-text-primary)]">
                  {report.config_json.date_from} to {report.config_json.date_to}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Generated: </span>
                <span className="text-[var(--color-text-primary)]">
                  {report.completed_at
                    ? formatDateTime(report.completed_at)
                    : "-"}
                </span>
              </div>
            </div>

            {/* Report data preview */}
            {report.data_json && (
              <div className="mt-2">
                <p className={`mb-1 ${TYPO_INPUT_LABEL}`}>
                  Data Preview
                </p>
                <pre
                  data-testid="report-data"
                  className="text-xs bg-[var(--color-surface-tertiary)] rounded-[var(--radius-md)] p-3 overflow-auto max-h-60"
                >
                  {JSON.stringify(report.data_json, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
