/**
 * Login history table with pagination (PRD-98).
 *
 * Displays login attempts with success/failure badges and pagination controls.
 */

import { useState, useMemo } from "react";

import { Card } from "@/components/composite/Card";
import { Badge, Button, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";

import { useLoginHistory } from "./hooks/use-session-management";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZE = 50;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LoginHistoryTable() {
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    }),
    [page],
  );

  const { data, isLoading, error } = useLoginHistory(params);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load login history.
      </p>
    );
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                Username
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                IP Address
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                Result
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                Reason
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.items.length === 0) && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                >
                  No login attempts found.
                </td>
              </tr>
            )}
            {data?.items.map((attempt) => (
              <tr
                key={attempt.id}
                className="border-b border-[var(--color-border-default)] transition-colors hover:bg-[var(--color-surface-secondary)]"
              >
                <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
                  {attempt.username}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                  {attempt.ip_address ?? "-"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={attempt.success ? "success" : "danger"} size="sm">
                    {attempt.success ? "Success" : "Failed"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                  {attempt.failure_reason ?? "-"}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                  {formatDateTime(attempt.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-default)] px-4 py-3">
          <span className="text-sm text-[var(--color-text-muted)]">
            Showing {page * PAGE_SIZE + 1}
            {" - "}
            {Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
          </span>
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
  );
}
