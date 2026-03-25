/**
 * Audit Log Viewer (PRD-45).
 *
 * Searchable, filterable table of audit log entries with expandable row
 * details, pagination, and CSV/JSON export.
 */

import { useState, useCallback } from "react";

import { Button, FilterSelect, SearchInput, Select ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_BODY, TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, TERMINAL_LABEL } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
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
  useSetPageTitle("Audit Log", "Review all user and system actions in the platform.");

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
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Export actions */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleExport("csv")}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport("json")}>
            Export JSON
          </Button>
        </div>

        {/* Filters */}
        <div className={TERMINAL_PANEL}>
          <div className={cn(TERMINAL_BODY, "flex flex-wrap items-end gap-3")}>
            <SearchInput
              placeholder="Search log details..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(0);
              }}
              className="min-w-[200px] flex-1"
            />

            <FilterSelect
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
              className="w-[160px]"
            />

            <FilterSelect
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
              className="w-[160px]"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <ContextLoader size={64} />
          </div>
        ) : (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_LABEL}>Audit Entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className={TERMINAL_DIVIDER}>
                    <th className={cn(TERMINAL_TH, "px-4 py-2.5")}>
                      Timestamp
                    </th>
                    <th className={cn(TERMINAL_TH, "px-4 py-2.5")}>
                      User
                    </th>
                    <th className={cn(TERMINAL_TH, "px-4 py-2.5")}>
                      Action
                    </th>
                    <th className={cn(TERMINAL_TH, "px-4 py-2.5")}>
                      Entity
                    </th>
                    <th className={cn(TERMINAL_TH, "px-4 py-2.5")}>
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center font-mono text-xs text-[var(--color-text-muted)]"
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
              <div className="flex items-center justify-between border-t border-[var(--color-border-default)]/30 px-4 py-3">
                <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
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
                    size="xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
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
        className={cn("cursor-pointer", TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
      >
        <td className="px-4 py-2.5 text-cyan-400">
          {ts.toLocaleDateString()}{" "}
          <span className="text-[var(--color-text-muted)]">
            {ts.toLocaleTimeString()}
          </span>
        </td>
        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
          {log.user_id ? `User #${log.user_id}` : "System"}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-cyan-400">
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
            className="bg-[#161b22] px-4 py-3"
          >
            <div className="space-y-2 font-mono text-xs">
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
                  <p className={cn(TERMINAL_LABEL, "mb-1")}>
                    Details
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-[var(--radius-md)] bg-[#0d1117] p-3 text-xs text-cyan-400 font-mono">
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
      <p className={TERMINAL_LABEL}>
        {label}
      </p>
      <p className="truncate text-xs text-cyan-400 font-mono">
        {value ?? "-"}
      </p>
    </div>
  );
}
