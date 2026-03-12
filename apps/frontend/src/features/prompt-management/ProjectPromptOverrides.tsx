/**
 * Project-level prompt overrides organized by active workflow.
 *
 * Shows collapsible sections per workflow with prompt slot editing.
 */

import { useCallback } from "react";

import { useProjectSceneSettings } from "@/features/scene-catalogue";

import {
  useProjectPromptOverrides,
  useUpsertProjectPromptOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";

interface ProjectPromptOverridesProps {
  projectId: number;
}

export function ProjectPromptOverrides({ projectId }: ProjectPromptOverridesProps) {
  const { data: settings, isLoading: settingsLoading } = useProjectSceneSettings(projectId);
  const upsert = useUpsertProjectPromptOverrides();

  const useOverrides = (sceneTypeId: number) => useProjectPromptOverrides(projectId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ projectId, sceneTypeId, overrides });
    },
    [projectId, upsert],
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
