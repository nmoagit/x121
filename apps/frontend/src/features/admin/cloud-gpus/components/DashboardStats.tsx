/**
 * Cloud GPU dashboard summary stat cards (PRD-114).
 */

import { formatCents } from "@/lib/format";
import type { CloudDashboardStats } from "../hooks/use-cloud-providers";

interface Props {
  stats: CloudDashboardStats;
}

export function DashboardStats({ stats }: Props) {
  const cards = [
    { label: "Providers", value: `${stats.active_providers} / ${stats.total_providers}`, sub: "active" },
    { label: "Instances", value: String(stats.total_instances), sub: `${stats.running_instances} running` },
    { label: "Monthly Cost", value: formatCents(stats.total_cost_cents), sub: "last 30 days" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {c.label}
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">{c.value}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
