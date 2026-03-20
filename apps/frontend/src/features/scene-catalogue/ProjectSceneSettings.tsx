/**
 * Project-level scene settings panel (PRD-111).
 *
 * Shows effective scene settings expanded by track, with toggle switches
 * and source badges. Each scene_type × track combination is a separate row.
 * Each row toggles independently at per-track granularity.
 */

import { useCallback, useMemo } from "react";

import { LoadingPane } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_PANEL,
  TERMINAL_TH,
} from "@/lib/ui-classes";

import { useBatchSceneAssignments } from "@/features/projects/hooks/use-character-deliverables";

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
  const { data: assignments } = useBatchSceneAssignments(projectId);
  const expandedRows = useExpandedSettings(settings);
  const toggleMutation = useToggleProjectSceneSetting(projectId);

  const videoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!assignments) return map;
    for (const a of assignments) {
      const key = `${a.scene_type_id}::${a.track_id ?? ""}`;
      map.set(key, (map.get(key) ?? 0) + a.final_video_count);
    }
    return map;
  }, [assignments]);

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
    <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_BODY}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={TERMINAL_DIVIDER}>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Scene</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Track</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Enabled</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Source</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Videos</th>
                </tr>
              </thead>
              <tbody>
                {expandedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center font-mono text-xs text-[var(--color-text-muted)]"
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
                      hasVideo={(videoCountMap.get(`${row.scene_type_id}::${row.track_id ?? ""}`) ?? 0) > 0}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
  );
}
