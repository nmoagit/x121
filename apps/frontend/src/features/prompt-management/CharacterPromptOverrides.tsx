/**
 * Character-level prompt overrides organized by active workflow.
 *
 * Shows collapsible sections per workflow with prompt slot editing.
 */

import { useCallback } from "react";

import { useCharacterSceneSettings } from "@/features/scene-catalogue/hooks/use-character-scene-settings";

import {
  useCharacterSceneOverrides,
  useUpsertCharacterSceneOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";

interface CharacterPromptOverridesProps {
  characterId: number;
}

export function CharacterPromptOverrides({ characterId }: CharacterPromptOverridesProps) {
  const { data: settings, isLoading: settingsLoading } = useCharacterSceneSettings(characterId);
  const upsert = useUpsertCharacterSceneOverrides();

  const useOverrides = (sceneTypeId: number) =>
    useCharacterSceneOverrides(characterId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ characterId, sceneTypeId, overrides });
    },
    [characterId, upsert],
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
