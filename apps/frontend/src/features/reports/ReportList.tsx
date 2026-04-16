/**
 * Report list table for Production Reporting (PRD-73).
 *
 * Displays all generated reports with status badges and download links
 * for completed reports.
 */

import { Badge } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { API_BASE_URL } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Download, iconSizes } from "@/tokens/icons";

import { useReports } from "./hooks/use-reports";
import {
  FORMAT_LABELS,
  REPORT_STATUS_BADGE_VARIANT,
  REPORT_STATUS_LABELS,
  resolveReportStatus,
} from "./types";
import type { Report } from "./types";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Row component
   -------------------------------------------------------------------------- */

function ReportRow({ report }: { report: Report }) {
  const status = resolveReportStatus(report.status_id);
  const isCompleted = status === "completed";
  const downloadUrl = `${API_BASE_URL}/reports/${report.id}/download`;

  return (
    <tr
      data-testid={`report-row-${report.id}`}
      className="border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        {report.report_type_id}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {FORMAT_LABELS[report.format]}
      </td>
      <td className="px-3 py-2">
        <Badge variant={REPORT_STATUS_BADGE_VARIANT[status]} size="sm">
          {REPORT_STATUS_LABELS[status]}
        </Badge>
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
        {report.created_at ? formatDateTime(report.created_at) : "-"}
      </td>
      <td className="px-3 py-2">
        {isCompleted && (
          <a
            href={downloadUrl}
            data-testid={`download-link-${report.id}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--color-action-primary)] hover:underline"
          >
            <Download size={iconSizes.sm} aria-hidden="true" />
            Download
          </a>
        )}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ReportList() {
  const { data: reports, isLoading } = useReports();

  const list = reports ?? [];

  return (
    <div data-testid="report-list">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Generated Reports
          </h3>
        </CardHeader>

        <CardBody className="p-0">
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading reports...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="reports-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No reports generated yet.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Type
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Format
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Status
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Generated
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

