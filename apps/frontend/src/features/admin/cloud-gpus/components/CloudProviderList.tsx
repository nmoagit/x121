/**
 * Sidebar list of cloud GPU providers (PRD-114).
 */

import { useInstances, useScalingRules } from "../hooks/use-cloud-providers";
import type { CloudProvider } from "../hooks/use-cloud-providers";

interface Props {
  providers: CloudProvider[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// Sync: db/src/models/status.rs CloudProviderStatus enum discriminants
const PROVIDER_STATUS = {
  ACTIVE: 1,
  DISABLED: 2,
  ERROR: 3,
} as const;

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  [PROVIDER_STATUS.ACTIVE]: { label: "Active", color: "var(--color-status-success)" },
  [PROVIDER_STATUS.DISABLED]: { label: "Disabled", color: "var(--color-text-muted)" },
  [PROVIDER_STATUS.ERROR]: { label: "Error", color: "var(--color-status-error)" },
};

export function CloudProviderList({ providers, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {providers.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p}
          isSelected={p.id === selectedId}
          onSelect={() => onSelect(p.id)}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  isSelected,
  onSelect,
}: {
  provider: CloudProvider;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { data: instances } = useInstances(provider.id);
  const { data: rules } = useScalingRules(provider.id);

  const status = STATUS_LABELS[provider.status_id] ?? { label: "Unknown", color: "var(--color-text-muted)" };
  const instanceCount = instances?.length ?? 0;
  const maxInstances = rules?.reduce((max, r) => max + r.max_instances, 0) ?? 0;

  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors ${
        isSelected
          ? "border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]"
          : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)]"
      }`}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: status.color }}
        title={status.label}
      />
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{provider.name}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {provider.provider_type} &middot; {instanceCount}/{maxInstances} instances
        </p>
      </div>
    </button>
  );
}
