/**
 * Character-level scene setting overrides panel (PRD-111).
 *
 * Thin wrapper around SceneSettingOverridesPanel that wires up
 * character-specific hooks.
 */

import { useMemo } from "react";

import { useBatchSceneAssignments } from "@/features/projects/hooks/use-character-deliverables";

import { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";
import {
  useCharacterSceneSettings,
  useRemoveCharacterSceneOverride,
  useToggleCharacterSceneSetting,
} from "./hooks/use-character-scene-settings";

interface CharacterSceneOverridesProps {
  projectId: number;
  characterId: number;
}

export function CharacterSceneOverrides({ projectId, characterId }: CharacterSceneOverridesProps) {
  const { data: settings, isLoading } = useCharacterSceneSettings(characterId);
  const toggleMutation = useToggleCharacterSceneSetting(characterId);
  const removeMutation = useRemoveCharacterSceneOverride(characterId);

  const { data: assignments } = useBatchSceneAssignments(projectId);

  const videoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!assignments) return map;

    for (const a of assignments) {
      if (a.character_id !== characterId) continue;
      const key = `${a.scene_type_id}::${a.track_id ?? ""}`;
      map.set(key, (map.get(key) ?? 0) + a.final_video_count);
    }
    return map;
  }, [assignments, characterId]);

  return (
    <SceneSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="character"
      entityLabel="character"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
      videoCountMap={videoCountMap}
    />
  );
}
