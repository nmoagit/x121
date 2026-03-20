/**
 * Shared table row for scene setting displays (PRD-111).
 *
 * Terminal-style monospace row with scene name, track, toggle, source label.
 */

import type { ReactNode } from "react";

import { Toggle, Tooltip } from "@/components/primitives";
import { Film } from "@/tokens/icons";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";

import type { ExpandedSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Source color mapping
   -------------------------------------------------------------------------- */

const SOURCE_COLORS: Record<string, string> = {
  scene_type: "text-[var(--color-text-muted)]",
  project: "text-cyan-400",
  group: "text-green-400",
  character: "text-orange-400",
};

const SOURCE_LABELS: Record<string, string> = {
  scene_type: "default",
  project: "project",
  group: "group",
  character: "model",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface SceneSettingRowProps {
  row: ExpandedSceneSetting;
  onToggle: (sceneTypeId: number, trackId: number | null, enabled: boolean) => void;
  isPending: boolean;
  hasVideo?: boolean;
  actions?: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneSettingRow({ row, onToggle, isPending, hasVideo, actions }: SceneSettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]/30 last:border-b-0">
      {/* Scene name */}
      <td className="px-3 py-1.5 font-mono text-xs">
        {row.isFirstInGroup ? (
          <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{row.name}</span>
        ) : (
          <span />
        )}
      </td>

      {/* Track */}
      <td className="px-3 py-1.5 font-mono text-xs">
        <span className="inline-flex items-center gap-1">
          {row.track_slug ? (
            <span className={TRACK_TEXT_COLORS[row.track_slug] ?? "text-[var(--color-text-primary)]"}>{row.track_name}</span>
          ) : (
            <span className="text-[var(--color-text-muted)]">-</span>
          )}
          {row.has_clothes_off_transition && (
            <span className="text-orange-400">clothes off</span>
          )}
        </span>
      </td>

      {/* Toggle */}
      <td className="px-3 py-1.5">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => onToggle(row.scene_type_id, row.track_id, checked)}
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

      {/* Video indicator */}
      {hasVideo !== undefined && (
        <td className="px-3 py-1.5 text-center">
          <Tooltip content={hasVideo ? "Has videos" : "No videos"}>
            <span className="inline-flex items-center justify-center">
              <Film
                size={14}
                className={hasVideo ? "text-green-400" : "text-[var(--color-text-muted)] opacity-40"}
              />
            </span>
          </Tooltip>
        </td>
      )}

      {/* Actions */}
      {actions !== undefined && <td className="px-3 py-1.5">{actions}</td>}
    </tr>
  );
}
