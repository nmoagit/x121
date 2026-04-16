/**
 * Shared table row for image setting displays (PRD-154).
 *
 * Terminal-style monospace row with image type name, toggle, source label.
 */

import type { ReactNode } from "react";

import { Toggle } from "@/components/primitives";
import { CATALOGUE_SOURCE_COLORS, CATALOGUE_SOURCE_LABELS } from "@/lib/setting-source";

import type { EffectiveImageSetting } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface ImageSettingRowProps {
  row: EffectiveImageSetting;
  onToggle: (imageTypeId: number, trackId: number | null, enabled: boolean) => void;
  isPending: boolean;
  actions?: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImageSettingRow({ row, onToggle, isPending, actions }: ImageSettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]/30 last:border-b-0">
      {/* Image type name */}
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{row.name}</span>
      </td>

      {/* Toggle */}
      <td className="px-3 py-1.5">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => onToggle(row.image_type_id, row.track_id, checked)}
          size="sm"
          disabled={isPending}
        />
      </td>

      {/* Source */}
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        <span className={CATALOGUE_SOURCE_COLORS[row.source] ?? "text-[var(--color-text-muted)]"}>
          {CATALOGUE_SOURCE_LABELS[row.source] ?? row.source}
        </span>
      </td>

      {/* Actions */}
      {actions !== undefined && <td className="px-3 py-1.5">{actions}</td>}
    </tr>
  );
}
