/**
 * Avatar-level prompt overrides organized by active workflow.
 *
 * Shows collapsible sections per workflow with prompt slot editing.
 */

import { useCallback } from "react";

import { useAvatarSceneSettings } from "@/features/scene-catalogue/hooks/use-avatar-scene-settings";

import {
  useAvatarSceneOverrides,
  useUpsertAvatarSceneOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";

interface AvatarPromptOverridesProps {
  avatarId: number;
}

export function AvatarPromptOverrides({ avatarId }: AvatarPromptOverridesProps) {
  const { data: settings, isLoading: settingsLoading } = useAvatarSceneSettings(avatarId);
  const upsert = useUpsertAvatarSceneOverrides();

  const useOverrides = (sceneTypeId: number) =>
    useAvatarSceneOverrides(avatarId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ avatarId, sceneTypeId, overrides });
    },
    [avatarId, upsert],
  );

  return (
    <WorkflowPromptOverridePanel
      settings={settings}
      settingsLoading={settingsLoading}
      useOverrides={useOverrides}
      onSave={handleSave}
      isSaving={upsert.isPending}
    />
  );
}
