/**
 * Shared table row for scene setting displays (PRD-111).
 *
 * Terminal-style monospace row with scene name, track, toggle, source label.
 */

import type { ReactNode } from "react";

import { Toggle, Tooltip } from "@/components/primitives";
import { Film } from "@/tokens/icons";
import { CATALOGUE_SOURCE_COLORS, CATALOGUE_SOURCE_LABELS } from "@/lib/setting-source";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";

import type { ExpandedSceneSetting } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface SceneSettingRowProps {
  row: ExpandedSceneSetting;
  onToggle: (sceneTypeId: number, trackId: number | null, enabled: boolean) => void;
  isPending: boolean;
  hasVideo?: boolean;
  actions?: ReactNode;
  /** Hide track column — true for single-track pipelines. */
  hideTracks?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneSettingRow({ row, onToggle, isPending, hasVideo, actions, hideTracks }: SceneSettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]/30 last:border-b-0">
      {/* Scene name */}
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        {row.isFirstInGroup ? (
          <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{row.name}</span>
        ) : (
          <span />
        )}
      </td>

      {/* Track — hidden for single-track pipelines */}
      {!hideTracks && (
        <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
          <span className="inline-flex items-center gap-1">
            {row.track_slug ? (
              <span className={TRACK_TEXT_COLORS[row.track_slug] ?? "text-[var(--color-text-primary)]"}>{row.track_name}</span>
            ) : (
              <span className="text-[var(--color-text-muted)]">-</span>
            )}
            {row.has_clothes_off_transition && (
              <span className="text-[var(--color-data-orange)]">clothes off</span>
            )}
          </span>
        </td>
      )}

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
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        <span className={CATALOGUE_SOURCE_COLORS[row.source] ?? "text-[var(--color-text-muted)]"}>
          {CATALOGUE_SOURCE_LABELS[row.source] ?? row.source}
        </span>
      </td>

      {/* Video indicator */}
      {hasVideo !== undefined && (
        <td className="px-3 py-1.5 text-center">
          <Tooltip content={hasVideo ? "Has videos" : "No videos"}>
            <span className="inline-flex items-center justify-center">
              <Film
                size={14}
                className={hasVideo ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] opacity-40"}
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
