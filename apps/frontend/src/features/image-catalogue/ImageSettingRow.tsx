/**
 * Shared table row for image setting displays (PRD-154).
 *
 * Terminal-style monospace row with image type name, toggle, source label.
 */

import type { ReactNode } from "react";

import { Toggle } from "@/components/primitives";

import type { EffectiveImageSetting } from "./types";

/* --------------------------------------------------------------------------
   Source color mapping
   -------------------------------------------------------------------------- */

const SOURCE_COLORS: Record<string, string> = {
  image_type: "text-[var(--color-text-muted)]",
  project: "text-cyan-400",
  group: "text-green-400",
  avatar: "text-orange-400",
};

const SOURCE_LABELS: Record<string, string> = {
  image_type: "default",
  project: "project",
  group: "group",
  avatar: "model",
};

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
      <td className="px-3 py-1.5 font-mono text-xs">
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
      <td className="px-3 py-1.5 font-mono text-xs">
        <span className={SOURCE_COLORS[row.source] ?? "text-[var(--color-text-muted)]"}>
          {SOURCE_LABELS[row.source] ?? row.source}
        </span>
      </td>

      {/* Actions */}
      {actions !== undefined && <td className="px-3 py-1.5">{actions}</td>}
    </tr>
  );
}
