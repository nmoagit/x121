/**
 * Ranked table of top API consumers (PRD-106).
 *
 * Sortable by request volume, error rate, or bandwidth.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { formatBytes } from "@/lib/format";
import { BarChart3 } from "@/tokens/icons";

import { useTopConsumers } from "./hooks/use-api-observability";
import type { TimePeriod, TopConsumer } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

type SortField = "request_count" | "error_rate" | "total_bandwidth";

/* --------------------------------------------------------------------------
   Sub-component: column header
   -------------------------------------------------------------------------- */

interface SortHeaderProps {
  field: SortField;
  activeSort: SortField;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}

function SortHeader({ field, activeSort, onSort, children }: SortHeaderProps) {
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      onClick={() => onSort(field)}
    >
      {children}
      {activeSort === field && " \u25BC"}
    </th>
  );
}

/* --------------------------------------------------------------------------
   Sub-component: consumer row
   -------------------------------------------------------------------------- */

interface ConsumerRowProps {
  consumer: TopConsumer;
  rank: number;
}

function ConsumerRow({ consumer, rank }: ConsumerRowProps) {
  return (
    <tr className="border-t border-[var(--color-border-default)]">
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{rank}</td>
      <td className="px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
        {consumer.api_key_id != null ? `Key #${consumer.api_key_id}` : "Anonymous"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {consumer.request_count.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {consumer.error_rate.toFixed(1)}%
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {formatBytes(consumer.total_bandwidth)}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TopConsumersTableProps {
  period?: TimePeriod;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TopConsumersTable({ period = "24h" }: TopConsumersTableProps) {
  const [sort, setSort] = useState<SortField>("request_count");
  const { data: consumers, isLoading, error } = useTopConsumers(sort, period, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-6)]">
        <Spinner size="md" />
      </div>
    );
  }

  if (error || !consumers) {
    return (
      <p className="py-[var(--spacing-4)] text-center text-sm text-[var(--color-text-muted)]">
        Failed to load consumer data.
      </p>
    );
  }

  if (consumers.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-sm text-[var(--color-text-muted)]">
          No consumer data available.
        </p>
      </Card>
    );
  }

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <BarChart3 size={16} className="text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Top Consumers
          </span>
        </div>
      </CardHeader>
      <CardBody className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
                  #
                </th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
                  API Key
                </th>
                <SortHeader field="request_count" activeSort={sort} onSort={setSort}>
                  Requests
                </SortHeader>
                <SortHeader field="error_rate" activeSort={sort} onSort={setSort}>
                  Error Rate
                </SortHeader>
                <SortHeader field="total_bandwidth" activeSort={sort} onSort={setSort}>
                  Bandwidth
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {consumers.map((c, i) => (
                <ConsumerRow key={c.api_key_id ?? `anon-${i}`} consumer={c} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
