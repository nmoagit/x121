/**
 * PresetListItem -- single preset row in the preset popover (PRD-89).
 */

import { Badge } from "@/components/primitives";
import { Check, Copy, Trash2 } from "@/tokens/icons";

import type { DashboardPreset } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface PresetListItemProps {
  preset: DashboardPreset;
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
  onShare: (id: number) => void;
}

export function PresetListItem({
  preset,
  onActivate,
  onDelete,
  onShare,
}: PresetListItemProps) {
  return (
    <div
      data-testid={`preset-item-${preset.id}`}
      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--color-surface-tertiary)] rounded-[var(--radius-sm)]"
    >
      <button
        type="button"
        className="flex items-center gap-2 min-w-0 flex-1 text-left"
        onClick={() => onActivate(preset.id)}
      >
        {preset.is_active && (
          <Check
            size={14}
            className="text-[var(--color-action-success)] shrink-0"
            aria-hidden="true"
          />
        )}
        <span className="text-sm text-[var(--color-text-primary)] truncate">
          {preset.name}
        </span>
        {preset.is_active && (
          <Badge variant="success" size="sm">
            Active
          </Badge>
        )}
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onShare(preset.id)}
          className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
          aria-label={`Share ${preset.name}`}
        >
          <Copy size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(preset.id)}
          className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] hover:bg-[var(--color-surface-secondary)]"
          aria-label={`Delete ${preset.name}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
