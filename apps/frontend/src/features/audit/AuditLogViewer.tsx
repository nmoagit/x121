/**
 * Audit Log Viewer (PRD-45).
 *
 * Searchable, filterable table of audit log entries with expandable row
 * details, pagination, and CSV/JSON export.
 */

import { useState, useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Button, Input, Select, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useAuditLogs, exportAuditLogs } from "./hooks/use-audit";
import {
  ACTION_TYPES,
  ENTITY_TYPES,
  actionTypeLabel,
  type AuditLog,
  type AuditQueryParams,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AuditLogViewer() {
  const [searchText, setSearchText] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const params: AuditQueryParams = {
    ...(searchText && { search_text: searchText }),
    ...(actionTypeFilter && { action_type: actionTypeFilter }),
    ...(entityTypeFilter && { entity_type: entityTypeFilter }),
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data, isLoading } = useAuditLogs(params);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      try {
        await exportAuditLogs(format);
      } catch {
        // Silently fail -- toast can be added later.
      }
    },
    [],
  );

  const toggleRow = useCallback((id: number) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] p-[var(--spacing-6)]">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Audit Log
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Review all user and system actions in the platform.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleExport("csv")}>
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("json")}>
              Export JSON
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card padding="md">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Input
                label="Search"
                placeholder="Search log details..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="w-[160px]">
              <Select
                label="Action Type"
                value={actionTypeFilter}
                onChange={(val) => {
                  setActionTypeFilter(val);
                  setPage(0);
                }}
                options={[
                  { value: "", label: "All Actions" },
                  ...ACTION_TYPES.map((a) => ({
                    value: a,
                    label: actionTypeLabel(a),
                  })),
                ]}
              />
            </div>

            <div className="w-[160px]">
              <Select
                label="Entity Type"
                value={entityTypeFilter}
                onChange={(val) => {
                  setEntityTypeFilter(val);
                  setPage(0);
                }}
                options={[
                  { value: "", label: "All Entities" },
                  ...ENTITY_TYPES.map((e) => ({
                    value: e,
                    label: e,
                  })),
                ]}
              />
            </div>
          </div>
        </Card>

        {/* Table */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                      Timestamp
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                      User
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                      Action
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                      Entity
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                      >
                        No audit log entries found.
                      </td>
                    </tr>
                  )}
                  {data?.items.map((log) => (
                    <AuditLogRow
                      key={log.id}
                      log={log}
                      expanded={expandedRow === log.id}
                      onToggle={() => toggleRow(log.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.total > 0 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border-default)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                  <span>
                    Showing {page * pageSize + 1}
                    {" - "}
                    {Math.min((page + 1) * pageSize, data.total)} of{" "}
                    {data.total}
                  </span>
                  <Select
                    value={String(pageSize)}
                    onChange={(val) => {
                      setPageSize(Number(val));
                      setPage(0);
                    }}
                    options={PAGE_SIZES.map((s) => ({
                      value: String(s),
                      label: `${s} per page`,
                    }))}
                  />
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row sub-component
   -------------------------------------------------------------------------- */

function AuditLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ts = new Date(log.timestamp);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--color-border-default)] transition-colors hover:bg-[var(--color-surface-secondary)]"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
      >
        <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
          {ts.toLocaleDateString()}{" "}
          <span className="text-[var(--color-text-muted)]">
            {ts.toLocaleTimeString()}
          </span>
        </td>
        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
          {log.user_id ? `User #${log.user_id}` : "System"}
        </td>
        <td className="px-4 py-2.5">
          <span className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
            {actionTypeLabel(log.action_type)}
          </span>
        </td>
        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
          {log.entity_type
            ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ""}`
            : "-"}
        </td>
        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
          {log.ip_address ?? "-"}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td
            colSpan={5}
            className="bg-[var(--color-surface-secondary)] px-4 py-3"
          >
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <DetailItem label="Session ID" value={log.session_id} />
                <DetailItem label="User Agent" value={log.user_agent} />
                <DetailItem label="Integrity Hash" value={log.integrity_hash} />
                <DetailItem
                  label="Created At"
                  value={new Date(log.created_at).toLocaleString()}
                />
              </div>
              {log.details_json && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
                    Details
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-primary)] p-3 text-xs text-[var(--color-text-secondary)]">
                    {JSON.stringify(log.details_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
   Detail item sub-component
   -------------------------------------------------------------------------- */

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="truncate text-xs text-[var(--color-text-secondary)]">
        {value ?? "-"}
      </p>
    </div>
  );
}
