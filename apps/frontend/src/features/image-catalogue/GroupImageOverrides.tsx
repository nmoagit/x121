/**
 * Group-level image setting overrides panel (PRD-154).
 *
 * Thin wrapper around ImageSettingOverridesPanel that wires up
 * group-specific hooks.
 */

import { ImageSettingOverridesPanel } from "./ImageSettingOverridesPanel";
import {
  useGroupImageSettings,
  useRemoveGroupImageOverride,
  useToggleGroupImageSetting,
} from "./hooks/use-group-image-settings";

interface GroupImageOverridesProps {
  projectId: number;
  groupId: number;
}

export function GroupImageOverrides({ projectId, groupId }: GroupImageOverridesProps) {
  const { data: settings, isLoading } = useGroupImageSettings(projectId, groupId);
  const toggleMutation = useToggleGroupImageSetting(projectId, groupId);
  const removeMutation = useRemoveGroupImageOverride(projectId, groupId);

  return (
    <ImageSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="group"
      entityLabel="group"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
    />
  );
}
