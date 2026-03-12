/**
 * Character settings tab with pipeline settings, scene overrides,
 * workflow assignments, and prompt overrides (PRD-112).
 */

import { useCallback, useState } from "react";

import { CollapsibleSection, ConfigToolbar } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { ChevronDown, ChevronUp } from "@/tokens/icons";

import { useExportCharacterSettings, useConfigImport } from "@/features/config-io";
import { PipelineSettingsEditor } from "@/features/character-dashboard";
import { CharacterPromptOverrides } from "@/features/prompt-management";
import { CharacterSceneOverrides, CharacterWorkflowOverrides } from "@/features/scene-catalogue";
import { CharacterVideoSettings } from "@/features/video-settings";

import {
  useCharacterSettings,
  useUpdateCharacterSettings,
} from "../hooks/use-character-detail";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

const CHAR_SECTION_IDS = ["pipeline", "scenes", "workflows", "video", "prompts"] as const;
type CharSectionId = (typeof CHAR_SECTION_IDS)[number];

interface CharacterSettingsTabProps {
  projectId: number;
  characterId: number;
  characterName?: string;
}

export function CharacterSettingsTab({
  projectId,
  characterId,
  characterName = "character",
}: CharacterSettingsTabProps) {
  const { data: settings, isLoading } = useCharacterSettings(
    projectId,
    characterId,
  );
  const updateSettings = useUpdateCharacterSettings(projectId, characterId);
  const { exporting, exportConfig } = useExportCharacterSettings();
  const { importing, importFile } = useConfigImport();

  const [openSections, setOpenSections] = useState<Set<CharSectionId>>(new Set(CHAR_SECTION_IDS));

  const toggleSection = useCallback((id: CharSectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allExpanded = openSections.size === CHAR_SECTION_IDS.length;

  function toggleAll() {
    setOpenSections(allExpanded ? new Set() : new Set(CHAR_SECTION_IDS));
  }

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={6}>
      <div className="flex justify-end gap-[var(--spacing-2)]">
        <Button
          variant="ghost"
          size="sm"
          icon={allExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          onClick={toggleAll}
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
        <ConfigToolbar
          onExport={() => exportConfig(projectId, characterId, characterName)}
          onImport={(file) => importFile(file)}
          exporting={exporting}
          importing={importing}
        />
      </div>

      <CollapsibleSection card title="Pipeline Settings" description="Configure generation pipeline for this character." open={openSections.has("pipeline")} onToggle={() => toggleSection("pipeline")}>
        <PipelineSettingsEditor
          settings={settings ?? {}}
          onSave={(updates) => updateSettings.mutate(updates)}
          isSaving={updateSettings.isPending}
        />
      </CollapsibleSection>

      <CollapsibleSection card title="Scene Settings" description="Override scene settings for this character." open={openSections.has("scenes")} onToggle={() => toggleSection("scenes")}>
        <CharacterSceneOverrides characterId={characterId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Workflow Assignments" description="Assign workflows per scene and track." open={openSections.has("workflows")} onToggle={() => toggleSection("workflows")}>
        <CharacterWorkflowOverrides characterId={characterId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Video Settings" description="Override video duration, FPS, and resolution per scene type." open={openSections.has("video")} onToggle={() => toggleSection("video")}>
        <CharacterVideoSettings characterId={characterId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Prompt Overrides" description="Override prompt templates for this character." open={openSections.has("prompts")} onToggle={() => toggleSection("prompts")}>
        <CharacterPromptOverrides characterId={characterId} />
      </CollapsibleSection>
    </Stack>
  );
}
