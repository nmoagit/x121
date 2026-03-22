/**
 * Avatar-level scene setting overrides panel (PRD-111).
 *
 * Thin wrapper around SceneSettingOverridesPanel that wires up
 * avatar-specific hooks.
 */

import { useMemo } from "react";

import { useBatchSceneAssignments } from "@/features/projects/hooks/use-avatar-deliverables";

import { SceneSettingOverridesPanel } from "./SceneSettingOverridesPanel";
import {
  useAvatarSceneSettings,
  useRemoveAvatarSceneOverride,
  useToggleAvatarSceneSetting,
} from "./hooks/use-avatar-scene-settings";

interface AvatarSceneOverridesProps {
  projectId: number;
  avatarId: number;
}

export function AvatarSceneOverrides({ projectId, avatarId }: AvatarSceneOverridesProps) {
  const { data: settings, isLoading } = useAvatarSceneSettings(avatarId);
  const toggleMutation = useToggleAvatarSceneSetting(avatarId);
  const removeMutation = useRemoveAvatarSceneOverride(avatarId);

  const { data: assignments } = useBatchSceneAssignments(projectId);

  const videoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!assignments) return map;

    for (const a of assignments) {
      if (a.avatar_id !== avatarId) continue;
      const key = `${a.scene_type_id}::${a.track_id ?? ""}`;
      map.set(key, (map.get(key) ?? 0) + a.final_video_count);
    }
    return map;
  }, [assignments, avatarId]);

  return (
    <SceneSettingOverridesPanel
      settings={settings}
      isLoading={isLoading}
      sourceName="avatar"
      entityLabel="model"
      toggleMutation={toggleMutation}
      removeMutation={removeMutation}
      videoCountMap={videoCountMap}
    />
  );
}
