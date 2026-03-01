/**
 * Group-level scene setting overrides panel.
 *
 * Thin wrapper around SceneSettingOverridesPanel that wires up
 * group-specific hooks.
 */

import {
  useGroupSceneSettings,
  useRemoveGroupSceneOverride,
  useToggleGroupSceneSetting,
} from "./hooks/use-group-scene-settings";
import { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";

interface GroupSceneOverridesProps {
  projectId: number;
  groupId: number;
}

export function GroupSceneOverrides({ projectId, groupId }: GroupSceneOverridesProps) {
  const { data: settings, isLoading } = useGroupSceneSettings(projectId, groupId);
  const toggleMutation = useToggleGroupSceneSetting(projectId, groupId);
  const removeMutation = useRemoveGroupSceneOverride(projectId, groupId);

  return (
    <SceneSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="group"
      entityLabel="group"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
    />
  );
}
