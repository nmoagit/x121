/**
 * Project-level scene settings panel (PRD-111).
 *
 * Shows effective scene settings expanded by track, with toggle switches
 * and source badges. Each scene_type × track combination is a separate row.
 * Each row toggles independently at per-track granularity.
 */

import { useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { LoadingPane } from "@/components/primitives";

import { SceneSettingRow } from "./SceneSettingRow";
import { useExpandedSettings } from "./hooks/use-expanded-settings";
import {
  useProjectSceneSettings,
  useToggleProjectSceneSetting,
} from "./hooks/use-project-scene-settings";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectSceneSettingsProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ProjectSceneSettings({ projectId }: ProjectSceneSettingsProps) {
  const { data: settings, isLoading: settingsLoading } = useProjectSceneSettings(projectId);
  const expandedRows = useExpandedSettings(settings);
  const toggleMutation = useToggleProjectSceneSetting(projectId);

  const handleToggle = useCallback(
    (sceneTypeId: number, trackId: number | null, enabled: boolean) => {
      toggleMutation.mutate({
        scene_type_id: sceneTypeId,
        track_id: trackId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  if (settingsLoading) {
    return <LoadingPane />;
  }

  return (
    <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Scene
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Track
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Enabled
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]"
                  >
                    No scene settings available. Add scenes to the catalogue first.
                  </td>
                </tr>
              ) : (
                expandedRows.map((row) => (
                  <SceneSettingRow
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
  );
}
