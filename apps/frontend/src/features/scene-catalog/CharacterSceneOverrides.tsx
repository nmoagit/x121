/**
 * Character-level scene setting overrides panel (PRD-111).
 *
 * Thin wrapper around SceneSettingOverridesPanel that wires up
 * character-specific hooks.
 */

import {
  useCharacterSceneSettings,
  useRemoveCharacterSceneOverride,
  useToggleCharacterSceneSetting,
} from "./hooks/use-character-scene-settings";
import { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";

interface CharacterSceneOverridesProps {
  characterId: number;
}

export function CharacterSceneOverrides({ characterId }: CharacterSceneOverridesProps) {
  const { data: settings, isLoading } = useCharacterSceneSettings(characterId);
  const toggleMutation = useToggleCharacterSceneSetting(characterId);
  const removeMutation = useRemoveCharacterSceneOverride(characterId);

  return (
    <SceneSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="character"
      entityLabel="character"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
    />
  );
}
