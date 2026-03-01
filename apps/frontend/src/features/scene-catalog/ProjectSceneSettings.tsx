/**
 * Project-level scene settings panel (PRD-111).
 *
 * Shows effective scene settings expanded by track, with toggle switches
 * and source badges. Each scene_type × track combination is a separate row.
 * Toggling any track row toggles the entire scene type (backend-level granularity).
 */

import { useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Stack } from "@/components/layout";
import { LoadingPane, Toggle } from "@/components/primitives";

import { SourceBadge } from "./SourceBadge";
import { TrackBadge } from "./TrackBadge";
import { useExpandedSettings } from "./hooks/use-expanded-settings";
import {
  useProjectSceneSettings,
  useToggleProjectSceneSetting,
} from "./hooks/use-project-scene-settings";
import type { ExpandedSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectSceneSettingsProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Setting row
   -------------------------------------------------------------------------- */

interface SettingRowProps {
  row: ExpandedSceneSetting;
  onToggle: (sceneTypeId: number, enabled: boolean) => void;
  isPending: boolean;
}

function SettingRow({ row, onToggle, isPending }: SettingRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      {/* Scene name — only shown on first row of each scene_type group */}
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

      {/* Toggle — toggles entire scene_type */}
      <td className="px-4 py-3">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => onToggle(row.scene_type_id, checked)}
          size="sm"
          disabled={isPending}
        />
      </td>

      {/* Source badge */}
      <td className="px-4 py-3">
        <SourceBadge source={row.source} />
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ProjectSceneSettings({ projectId }: ProjectSceneSettingsProps) {
  const { data: settings, isLoading: settingsLoading } = useProjectSceneSettings(projectId);
  const { expandedRows, catalogLoading } = useExpandedSettings(settings);
  const toggleMutation = useToggleProjectSceneSetting(projectId);

  const handleToggle = useCallback(
    (sceneTypeId: number, enabled: boolean) => {
      toggleMutation.mutate({
        scene_type_id: sceneTypeId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  if (settingsLoading || catalogLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={4}>
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Scene Settings</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Enable or disable scenes for this project. Overrides will be marked as "project".
        </p>
      </div>

      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Scene
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Track
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Enabled
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene settings available. Add scenes to the catalog first.
                  </td>
                </tr>
              ) : (
                expandedRows.map((row) => (
                  <SettingRow
                    key={`${row.scene_type_id}-${row.track_id ?? "none"}`}
                    row={row}
                    onToggle={handleToggle}
                    isPending={toggleMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}
