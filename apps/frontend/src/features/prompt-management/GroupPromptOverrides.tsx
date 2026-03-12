/**
 * Group-level prompt overrides organized by active workflow.
 *
 * Shows collapsible sections per workflow with prompt slot editing.
 */

import { useCallback } from "react";

import { useGroupSceneSettings } from "@/features/scene-catalogue/hooks/use-group-scene-settings";

import {
  useGroupPromptOverrides,
  useUpsertGroupPromptOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";

interface GroupPromptOverridesProps {
  projectId: number;
  groupId: number;
}

export function GroupPromptOverrides({ projectId, groupId }: GroupPromptOverridesProps) {
  const { data: settings, isLoading: settingsLoading } = useGroupSceneSettings(projectId, groupId);
  const upsert = useUpsertGroupPromptOverrides();

  const useOverrides = (sceneTypeId: number) =>
    useGroupPromptOverrides(projectId, groupId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ projectId, groupId, sceneTypeId, overrides });
    },
    [projectId, groupId, upsert],
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
