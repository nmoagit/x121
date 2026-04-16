/**
 * Cloud GPU dashboard summary stats — terminal ticker strip (PRD-114).
 */

import { formatCents } from "@/lib/format";
import type { CloudDashboardStats } from "../hooks/use-cloud-providers";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface Props {
  stats: CloudDashboardStats;
}

export function DashboardStats({ stats }: Props) {
  const items = [
    { label: "Providers", value: `${stats.active_providers}/${stats.total_providers}`, complete: stats.active_providers > 0 },
    { label: "Instances", value: String(stats.total_instances) },
    { label: "Running", value: String(stats.running_instances), complete: stats.running_instances > 0 },
    { label: "Cost (30d)", value: formatCents(stats.total_cost_cents) },
  ];

  return (
    <div className={`flex items-center gap-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-[var(--spacing-3)] py-[var(--spacing-2)] ${TYPO_DATA} overflow-x-auto`}>
      {items.map((item, idx) => (
        <span key={item.label} className="flex items-center whitespace-nowrap">
          {idx > 0 && (
            <span className="mx-3 text-[var(--color-text-muted)] opacity-30 select-none">|</span>
          )}
          <span className="uppercase tracking-wide text-[var(--color-text-muted)]">{item.label}:</span>
          <span className={`ml-1.5 font-semibold text-sm ${item.complete ? "text-[var(--color-data-green)]" : "text-[var(--color-data-cyan)]"}`}>
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
