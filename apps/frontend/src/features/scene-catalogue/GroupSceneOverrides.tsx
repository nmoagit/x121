/**
 * Group-level scene setting overrides panel.
 *
 * Thin wrapper around SceneSettingOverridesPanel that wires up
 * group-specific hooks.
 */

import { useMemo } from "react";

import { useBatchSceneAssignments } from "@/features/projects/hooks/use-character-deliverables";
import { useProjectCharacters } from "@/features/projects/hooks/use-project-characters";

import { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";
import {
  useGroupSceneSettings,
  useRemoveGroupSceneOverride,
  useToggleGroupSceneSetting,
} from "./hooks/use-group-scene-settings";

interface GroupSceneOverridesProps {
  projectId: number;
  groupId: number;
}

export function GroupSceneOverrides({ projectId, groupId }: GroupSceneOverridesProps) {
  const { data: settings, isLoading } = useGroupSceneSettings(projectId, groupId);
  const toggleMutation = useToggleGroupSceneSetting(projectId, groupId);
  const removeMutation = useRemoveGroupSceneOverride(projectId, groupId);

  const { data: characters } = useProjectCharacters(projectId);
  const { data: assignments } = useBatchSceneAssignments(projectId);

  const videoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!assignments || !characters) return map;

    const groupCharacterIds = new Set(
      characters.filter((c) => c.group_id === groupId).map((c) => c.id),
    );

    for (const a of assignments) {
      if (!groupCharacterIds.has(a.character_id)) continue;
      const key = `${a.scene_type_id}::${a.track_id ?? ""}`;
      map.set(key, (map.get(key) ?? 0) + a.final_video_count);
    }
    return map;
  }, [assignments, characters, groupId]);

  return (
    <SceneSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="group"
      entityLabel="group"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
      videoCountMap={videoCountMap}
    />
  );
}
