/**
 * Shared table row for scene setting displays (PRD-111).
 *
 * Used by both ProjectSceneSettings and CharacterSceneOverrides.
 * Renders the common columns (scene name, track badge, toggle, source badge)
 * and supports an optional trailing actions slot via render prop.
 */

import type { ReactNode } from "react";

import { Toggle, Tooltip } from "@/components/primitives";
import { Film } from "@/tokens/icons";

import { SourceBadge } from "./SourceBadge";
import { TrackBadge } from "./TrackBadge";
import type { ExpandedSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface SceneSettingRowProps {
  row: ExpandedSceneSetting;
  onToggle: (sceneTypeId: number, trackId: number | null, enabled: boolean) => void;
  isPending: boolean;
  /** Number of existing videos for this scene_type × track combination. */
  hasVideo?: boolean;
  /** Optional trailing cell content (e.g. a "Reset" button). */
  actions?: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneSettingRow({ row, onToggle, isPending, hasVideo, actions }: SceneSettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      {/* Scene name -- only shown on first row of each scene_type group */}
      <td className="px-3 py-1.5">
        {row.isFirstInGroup ? (
          <span className="text-xs font-medium text-[var(--color-text-primary)]">{row.name}</span>
        ) : (
          <span />
        )}
      </td>

      {/* Track badge */}
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1">
          {row.track_slug ? (
            <TrackBadge name={row.track_name ?? ""} slug={row.track_slug} />
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">-</span>
          )}
          {row.has_clothes_off_transition && (
            <TrackBadge name="Clothes Off" slug="clothes_off" />
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

      {/* Source badge */}
      <td className="px-3 py-1.5">
        <SourceBadge source={row.source} />
      </td>

      {/* Video count indicator */}
      {hasVideo !== undefined && (
        <td className="px-3 py-1.5">
          <Tooltip content={hasVideo ? "Has videos" : "No videos"}>
            <span className="inline-flex items-center gap-1">
              <Film
                size={14}
                className={hasVideo ? "text-[var(--color-status-success)]" : "text-[var(--color-text-muted)]"}
              />
            </span>
          </Tooltip>
        </td>
      )}

      {/* Optional actions column */}
      {actions !== undefined && <td className="px-3 py-1.5">{actions}</td>}
    </tr>
  );
}
