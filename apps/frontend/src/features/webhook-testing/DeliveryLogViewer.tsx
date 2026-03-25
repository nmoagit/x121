/**
 * DeliveryLogViewer -- paginated delivery log table with filters (PRD-99).
 *
 * Displays deliveries with timestamp, endpoint, event type, status code,
 * duration, and success badge. Rows expand to show request/response details.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, FilterSelect ,  ContextLoader } from "@/components/primitives";

import { DeliveryRow } from "./DeliveryRow";
import { useDeliveryLogs } from "./hooks/use-webhook-testing";
import type { DeliveryLogFilters } from "./types";
import { DELIVERY_FILTER_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZE = 20;

/* --------------------------------------------------------------------------
   Table header columns
   -------------------------------------------------------------------------- */

const COLUMNS = [
  "Timestamp",
  "Endpoint",
  "Event Type",
  "Status",
  "Duration",
  "Result",
  "Actions",
] as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DeliveryLogViewer() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<DeliveryLogFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [filterValue, setFilterValue] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useDeliveryLogs(filters);
  const deliveries = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleFilterChange = useCallback((value: string) => {
    setFilterValue(value);
    setPage(1);
    const updated: DeliveryLogFilters = { limit: PAGE_SIZE, offset: 0 };

    switch (value) {
      case "success":
        updated.success = true;
        break;
      case "failed":
        updated.success = false;
        break;
      case "test":
        updated.is_test = true;
        break;
      case "replay":
        updated.is_replay = true;
        break;
    }

    setFilters(updated);
    setExpandedId(null);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setFilters((prev) => ({ ...prev, offset: (newPage - 1) * PAGE_SIZE }));
    setExpandedId(null);
  }, []);

  const handleToggleRow = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ContextLoader size={48} />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Filter bar */}
      <div data-testid="delivery-filter-bar" className="flex items-center gap-4">
        <FilterSelect
          options={[...DELIVERY_FILTER_OPTIONS]}
          value={filterValue}
          onChange={handleFilterChange}
          placeholder="Filter deliveries"
          className="w-48"
        />
        <span className="text-xs text-[var(--color-text-muted)]">
          {total} {total === 1 ? "delivery" : "deliveries"}
        </span>
      </div>

      {/* Table */}
      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table data-testid="delivery-log-table" className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                {COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No delivery logs found.
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => (
                  <DeliveryRow
                    key={d.id}
                    delivery={d}
                    isExpanded={expandedId === d.id}
                    onToggle={() => handleToggleRow(d.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-[var(--color-text-secondary)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </Stack>
  );
}
