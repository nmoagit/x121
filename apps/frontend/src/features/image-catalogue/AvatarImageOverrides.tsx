/**
 * Avatar-level image setting overrides panel (PRD-154).
 *
 * Thin wrapper around ImageSettingOverridesPanel that wires up
 * avatar-specific hooks.
 */

import { ImageSettingOverridesPanel } from "./ImageSettingOverridesPanel";
import {
  useAvatarImageSettings,
  useRemoveAvatarImageOverride,
  useToggleAvatarImageSetting,
} from "./hooks/use-avatar-image-settings";

interface AvatarImageOverridesProps {
  avatarId: number;
}

export function AvatarImageOverrides({ avatarId }: AvatarImageOverridesProps) {
  const { data: settings, isLoading } = useAvatarImageSettings(avatarId);
  const toggleMutation = useToggleAvatarImageSetting(avatarId);
  const removeMutation = useRemoveAvatarImageOverride(avatarId);

  return (
    <ImageSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="avatar"
      entityLabel="model"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
    />
  );
}
