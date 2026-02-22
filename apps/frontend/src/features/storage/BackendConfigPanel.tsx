/**
 * Storage backend configuration panel (PRD-48).
 *
 * Displays all storage backends with status badges, type labels,
 * tier indicators, and capacity usage. Includes an "Add Backend" button.
 */

import { useState } from "react";

import { Card } from "@/components/composite/Card";
import { Badge } from "@/components/primitives";
import { formatBytes } from "@/lib/format";
import { HardDrive, Plus } from "@/tokens/icons";

import type { StorageBackend, StorageBackendStatusId, StorageBackendTypeId } from "./types";
import { BACKEND_STATUS_LABELS, BACKEND_STATUS_VARIANT, BACKEND_TYPE_LABELS } from "./types";
import { TierIndicator } from "./TierIndicator";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Compute usage percentage (0-100). */
function usagePercent(used: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(Math.round((used / total) * 100), 100);
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BackendConfigPanelProps {
  backends: StorageBackend[];
  onAdd?: () => void;
  onSelect?: (backend: StorageBackend) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BackendConfigPanel({ backends, onAdd, onSelect }: BackendConfigPanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function handleSelect(backend: StorageBackend) {
    setSelectedId(backend.id);
    onSelect?.(backend);
  }

  return (
    <div className="space-y-[var(--spacing-4)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Storage Backends
        </h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-[var(--spacing-3)] py-[var(--spacing-1)] text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={14} aria-hidden />
            Add Backend
          </button>
        )}
      </div>

      {/* Backend cards */}
      {backends.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No storage backends configured.
        </p>
      ) : (
        <div className="grid gap-[var(--spacing-3)] sm:grid-cols-2 lg:grid-cols-3">
          {backends.map((backend) => {
            const statusVariant =
              BACKEND_STATUS_VARIANT[backend.status_id as StorageBackendStatusId] ?? "default";
            const statusLabel =
              BACKEND_STATUS_LABELS[backend.status_id as StorageBackendStatusId] ?? "Unknown";
            const typeLabel =
              BACKEND_TYPE_LABELS[backend.backend_type_id as StorageBackendTypeId] ?? "Unknown";
            const pct = usagePercent(backend.used_bytes, backend.total_capacity_bytes);

            return (
              <Card
                key={backend.id}
                elevation="sm"
                padding="none"
                className={`cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]${
                  selectedId === backend.id
                    ? " ring-2 ring-[var(--color-primary)]"
                    : ""
                }`}
              >
                <div
                  className="px-[var(--spacing-4)] py-[var(--spacing-3)]"
                  onClick={() => handleSelect(backend)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") handleSelect(backend);
                  }}
                >
                  {/* Name + Status */}
                  <div className="flex items-center justify-between gap-[var(--spacing-2)]">
                    <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
                      <HardDrive
                        size={16}
                        className="shrink-0 text-[var(--color-text-muted)]"
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {backend.name}
                      </span>
                    </div>
                    <Badge variant={statusVariant} size="sm">
                      {statusLabel}
                    </Badge>
                  </div>

                  {/* Type + Tier */}
                  <div className="mt-[var(--spacing-2)] flex items-center gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
                    <span>{typeLabel}</span>
                    <TierIndicator tier={backend.tier} />
                  </div>

                  {/* Capacity bar */}
                  {pct !== null && (
                    <div className="mt-[var(--spacing-2)]">
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                        <span>
                          {formatBytes(backend.used_bytes)} /{" "}
                          {formatBytes(backend.total_capacity_bytes!)}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct > 90
                              ? "bg-[var(--color-danger)]"
                              : pct > 70
                                ? "bg-[var(--color-warning)]"
                                : "bg-[var(--color-success)]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Default badge */}
                  {backend.is_default && (
                    <div className="mt-[var(--spacing-2)]">
                      <Badge variant="info" size="sm">
                        Default
                      </Badge>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
