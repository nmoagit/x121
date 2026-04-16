/**
 * Storage backend configuration panel (PRD-48).
 *
 * Displays all storage backends with status badges, type labels,
 * tier indicators, and capacity usage. Includes an "Add Backend" button.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { formatBytes } from "@/lib/format";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_LABEL,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { HardDrive, Plus } from "@/tokens/icons";

import { TierIndicator } from "./TierIndicator";
import type { StorageBackend, StorageBackendStatusId, StorageBackendTypeId } from "./types";
import { BACKEND_STATUS_LABELS, BACKEND_TYPE_LABELS } from "./types";
import { TYPO_DATA, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Compute usage percentage (0-100). */
function usagePercent(used: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(Math.round((used / total) * 100), 100);
}

/** Map backend status to a terminal color key. */
function statusColorKey(statusId: StorageBackendStatusId): string {
  const map: Record<StorageBackendStatusId, string> = {
    1: "active",
    2: "queued",     // read_only -> warning color
    3: "failed",     // offline -> danger color
    4: "pending",    // decommissioned -> muted
  };
  return map[statusId] ?? "pending";
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BackendConfigPanelProps {
  backends: StorageBackend[];
  onAdd?: () => void;
  onSelect?: (backend: StorageBackend) => void;
  onSetDefault?: (backend: StorageBackend) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BackendConfigPanel({
  backends,
  onAdd,
  onSelect,
  onSetDefault,
}: BackendConfigPanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function handleSelect(backend: StorageBackend) {
    setSelectedId(backend.id);
    onSelect?.(backend);
  }

  return (
    <div className={TERMINAL_PANEL}>
      {/* Header */}
      <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
        <span className={TERMINAL_HEADER_TITLE}>Storage Backends</span>
        {onAdd && (
          <Button variant="primary" size="xs" onClick={onAdd} icon={<Plus size={14} />}>
            Add Backend
          </Button>
        )}
      </div>

      {/* Body */}
      <div className={TERMINAL_BODY}>
        {backends.length === 0 ? (
          <p className={TYPO_DATA_MUTED}>
            No storage backends configured.
          </p>
        ) : (
          <div className="space-y-0">
            {backends.map((backend, idx) => {
              const statusLabel =
                BACKEND_STATUS_LABELS[backend.status_id as StorageBackendStatusId] ?? "Unknown";
              const statusColor =
                TERMINAL_STATUS_COLORS[statusColorKey(backend.status_id as StorageBackendStatusId)] ??
                "text-[var(--color-text-muted)]";
              const typeLabel =
                BACKEND_TYPE_LABELS[backend.backend_type_id as StorageBackendTypeId] ?? "Unknown";
              const pct = usagePercent(backend.used_bytes, backend.total_capacity_bytes);
              const isSelected = selectedId === backend.id;

              return (
                <div
                  key={backend.id}
                  className={`${TERMINAL_ROW_HOVER} ${idx > 0 ? TERMINAL_DIVIDER : ""} cursor-pointer px-2 py-2.5 ${
                    isSelected ? "bg-[var(--color-surface-secondary)] ring-1 ring-cyan-400/40" : ""
                  }`}
                  onClick={() => handleSelect(backend)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") handleSelect(backend);
                  }}
                >
                  {/* Row 1: Name + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive
                        size={14}
                        className="shrink-0 text-[var(--color-text-muted)]"
                        aria-hidden
                      />
                      <span className={`truncate ${TYPO_DATA} font-medium text-[var(--color-text-primary)]`}>
                        {backend.name}
                      </span>
                      {backend.is_default && (
                        <span className="font-mono text-[10px] text-[var(--color-data-cyan)] uppercase tracking-wide">
                          default
                        </span>
                      )}
                    </div>
                    <span className={`${TYPO_DATA} uppercase ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Row 2: Type + Tier + Capacity */}
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className={TERMINAL_LABEL}>{typeLabel}</span>
                    <span className="opacity-30">|</span>
                    <TierIndicator tier={backend.tier} />
                    {pct !== null && (
                      <>
                        <span className="opacity-30">|</span>
                        <span className={TYPO_DATA_MUTED}>
                          {formatBytes(backend.used_bytes)} / {formatBytes(backend.total_capacity_bytes!)}
                        </span>
                        <span
                          className={`${TYPO_DATA} ${
                            pct > 90
                              ? "text-[var(--color-data-red)]"
                              : pct > 70
                                ? "text-[var(--color-data-orange)]"
                                : "text-[var(--color-data-green)]"
                          }`}
                        >
                          {pct}%
                        </span>
                      </>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {pct !== null && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 90
                            ? "bg-red-400"
                            : pct > 70
                              ? "bg-orange-400"
                              : "bg-cyan-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {/* Set as default button */}
                  {!backend.is_default && onSetDefault && (
                    <div className="mt-1.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetDefault(backend);
                        }}
                      >
                        Set as Default
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
