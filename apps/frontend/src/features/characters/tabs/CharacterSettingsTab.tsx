/**
 * Character settings tab with pipeline settings and scene overrides (PRD-112).
 */

import { LoadingPane } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { PipelineSettingsEditor } from "@/features/character-dashboard";
import { CharacterSceneOverrides } from "@/features/scene-catalog";

import {
  useCharacterSettings,
  useUpdateCharacterSettings,
} from "../hooks/use-character-detail";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterSettingsTabProps {
  projectId: number;
  characterId: number;
}

export function CharacterSettingsTab({
  projectId,
  characterId,
}: CharacterSettingsTabProps) {
  const { data: settings, isLoading } = useCharacterSettings(
    projectId,
    characterId,
  );
  const updateSettings = useUpdateCharacterSettings(projectId, characterId);

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={6}>
      <PipelineSettingsEditor
        settings={settings ?? {}}
        onSave={(updates) => updateSettings.mutate(updates)}
        isSaving={updateSettings.isPending}
      />
      <CharacterSceneOverrides characterId={characterId} />
    </Stack>
  );
}
