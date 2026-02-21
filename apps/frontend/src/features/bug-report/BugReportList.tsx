/**
 * Admin bug report list with status filtering (PRD-44).
 */

import { useState } from "react";

import { Badge, Button, Select, Spinner } from "@/components";
import { cn } from "@/lib/cn";

import {
  useBugReports,
  useUpdateBugReportStatus,
} from "./hooks/use-bug-reports";
import type { BugReportStatus } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_OPTIONS: { value: BugReportStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const STATUS_VARIANT: Record<BugReportStatus, "default" | "info" | "success" | "warning" | "danger"> = {
  new: "warning",
  triaged: "info",
  resolved: "success",
  closed: "default",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BugReportList() {
  const [statusFilter, setStatusFilter] = useState<BugReportStatus | "">("");
  const { data: reports, isLoading, isError } = useBugReports(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const updateStatus = useUpdateBugReportStatus();

  const handleStatusChange = (id: number, newStatus: BugReportStatus) => {
    updateStatus.mutate({ id, status: newStatus });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Bug Reports
        </h2>
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(val) =>
            setStatusFilter(val as BugReportStatus | "")
          }
          placeholder="Filter by status"
        />
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--color-action-danger)]">
          Failed to load bug reports.
        </p>
      )}

      {/* Report cards */}
      {reports && reports.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
          No bug reports found.
        </p>
      )}

      {reports?.map((report) => (
        <div
          key={report.id}
          className={cn(
            "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
            "bg-[var(--color-surface-secondary)] p-4",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  #{report.id}
                </span>
                <Badge variant={STATUS_VARIANT[report.status]}>
                  {report.status}
                </Badge>
              </div>

              {report.description && (
                <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
                  {report.description}
                </p>
              )}

              <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                {report.url && <span className="truncate max-w-xs">{report.url}</span>}
                <span>
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Quick triage actions */}
            <div className="flex gap-1 shrink-0">
              {report.status === "new" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleStatusChange(report.id, "triaged")
                  }
                >
                  Triage
                </Button>
              )}
              {report.status === "triaged" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleStatusChange(report.id, "resolved")
                  }
                >
                  Resolve
                </Button>
              )}
              {(report.status === "resolved" || report.status === "triaged") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleStatusChange(report.id, "closed")
                  }
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
