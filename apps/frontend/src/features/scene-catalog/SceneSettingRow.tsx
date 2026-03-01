/**
 * Shared table row for scene setting displays (PRD-111).
 *
 * Used by both ProjectSceneSettings and CharacterSceneOverrides.
 * Renders the common columns (scene name, track badge, toggle, source badge)
 * and supports an optional trailing actions slot via render prop.
 */

import type { ReactNode } from "react";

import { Toggle } from "@/components/primitives";

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
  /** Optional trailing cell content (e.g. a "Reset" button). */
  actions?: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneSettingRow({ row, onToggle, isPending, actions }: SceneSettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      {/* Scene name -- only shown on first row of each scene_type group */}
      <td className="px-4 py-3">
        {row.isFirstInGroup ? (
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{row.name}</span>
        ) : (
          <span />
        )}
      </td>

      {/* Track badge */}
      <td className="px-4 py-3">
        {row.track_slug ? (
          <TrackBadge name={row.track_name ?? ""} slug={row.track_slug} />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">-</span>
        )}
      </td>

      {/* Toggle */}
      <td className="px-4 py-3">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => onToggle(row.scene_type_id, row.track_id, checked)}
          size="sm"
          disabled={isPending}
        />
      </td>

      {/* Source badge */}
      <td className="px-4 py-3">
        <SourceBadge source={row.source} />
      </td>

      {/* Optional actions column */}
      {actions !== undefined && <td className="px-4 py-3">{actions}</td>}
    </tr>
  );
}
