/**
 * Character settings tab with inline editing (PRD-112).
 */

import { LoadingPane } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Settings } from "@/tokens/icons";

import { PipelineSettingsEditor } from "@/features/character-dashboard";

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

  if (!settings || Object.keys(settings).length === 0) {
    return (
      <EmptyState
        icon={<Settings size={32} />}
        title="No settings"
        description="This character has no settings configured."
      />
    );
  }

  return (
    <Stack gap={4}>
      <PipelineSettingsEditor
        settings={settings}
        onSave={(updates) => updateSettings.mutate(updates)}
        isSaving={updateSettings.isPending}
      />
    </Stack>
  );
}
