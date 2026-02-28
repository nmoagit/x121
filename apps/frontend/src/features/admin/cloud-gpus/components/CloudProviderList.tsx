/**
 * Sidebar list of cloud GPU providers (PRD-114).
 */

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
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      <div className="border-b border-[var(--color-border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Providers</h2>
      </div>
      <ul>
        {providers.map((p) => {
          const status = STATUS_LABELS[p.status_id] ?? { label: "Unknown", color: "var(--color-text-muted)" };
          const isSelected = p.id === selectedId;

          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "bg-[var(--color-surface-secondary)]"
                    : "hover:bg-[var(--color-surface-secondary)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{p.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.provider_type}</p>
                  </div>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: status.color }}
                    title={status.label}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
