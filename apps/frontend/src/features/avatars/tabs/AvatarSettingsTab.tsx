/**
 * Avatar settings tab with pipeline settings, scene overrides,
 * workflow assignments, and prompt overrides (PRD-112).
 */

import { useCallback, useState } from "react";

import { CollapsibleSection, ConfigToolbar } from "@/components/composite";
import { BlockingDeliverablesEditor } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { ChevronDown, ChevronUp } from "@/tokens/icons";

import { useExportAvatarSettings, useConfigImport } from "@/features/config-io";
import { PipelineSettingsEditor } from "@/features/avatar-dashboard";
import { AvatarPromptOverrides } from "@/features/prompt-management";
import { AvatarSceneOverrides, AvatarWorkflowOverrides } from "@/features/scene-catalogue";
import { AvatarVideoSettings } from "@/features/video-settings";

import {
  useAvatarSettings,
  useUpdateAvatarSettings,
} from "../hooks/use-avatar-detail";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

const CHAR_SECTION_IDS = ["blocking", "pipeline", "scenes", "workflows", "video", "prompts"] as const;
type CharSectionId = (typeof CHAR_SECTION_IDS)[number];

interface AvatarSettingsTabProps {
  projectId: number;
  avatarId: number;
  avatarName?: string;
  /** Avatar's own blocking_deliverables (null = inherited). */
  blockingDeliverables?: string[] | null;
  /** Effective blocking deliverables from parent (group or project). */
  parentBlockingDeliverables?: string[];
  /** Called with the new array when user changes blocking deliverables. Empty = reset to inherit. */
  onUpdateBlockingDeliverables?: (next: string[]) => void;
}

export function AvatarSettingsTab({
  projectId,
  avatarId,
  avatarName = "model",
  blockingDeliverables,
  parentBlockingDeliverables = [],
  onUpdateBlockingDeliverables,
}: AvatarSettingsTabProps) {
  const { data: settings, isLoading } = useAvatarSettings(
    projectId,
    avatarId,
  );
  const updateSettings = useUpdateAvatarSettings(projectId, avatarId);
  const { exporting, exportConfig } = useExportAvatarSettings();
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
          size="xs"
          icon={allExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          onClick={toggleAll}
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
        <ConfigToolbar
          onExport={() => exportConfig(projectId, avatarId, avatarName)}
          onImport={(file) => importFile(file)}
          exporting={exporting}
          importing={importing}
        />
      </div>

      {onUpdateBlockingDeliverables && (
        <CollapsibleSection card title="Blocking Deliverables" description="Override which deliverable sections must be complete for this avatar." open={openSections.has("blocking")} onToggle={() => toggleSection("blocking")}>
          <BlockingDeliverablesEditor
            effective={blockingDeliverables ?? parentBlockingDeliverables}
            isOverridden={blockingDeliverables != null}
            inheritLabel="Inherited from Group/Project"
            overrideLabel="Avatar Override"
            resetLabel="Reset to Group/Project Default"
            onUpdate={onUpdateBlockingDeliverables}
          />
        </CollapsibleSection>
      )}

      <CollapsibleSection card title="Pipeline Settings" description="Configure generation pipeline for this avatar." open={openSections.has("pipeline")} onToggle={() => toggleSection("pipeline")}>
        <PipelineSettingsEditor
          settings={settings ?? {}}
          onSave={(updates) => updateSettings.mutate(updates)}
          isSaving={updateSettings.isPending}
        />
      </CollapsibleSection>

      <CollapsibleSection card title="Scene Settings" description="Override scene settings for this avatar." open={openSections.has("scenes")} onToggle={() => toggleSection("scenes")}>
        <AvatarSceneOverrides projectId={projectId} avatarId={avatarId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Workflow Assignments" description="Assign workflows per scene and track." open={openSections.has("workflows")} onToggle={() => toggleSection("workflows")}>
        <AvatarWorkflowOverrides avatarId={avatarId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Video Settings" description="Override video duration, FPS, and resolution per scene type." open={openSections.has("video")} onToggle={() => toggleSection("video")}>
        <AvatarVideoSettings avatarId={avatarId} />
      </CollapsibleSection>

      <CollapsibleSection card title="Prompt Overrides" description="Override prompt templates for this avatar." open={openSections.has("prompts")} onToggle={() => toggleSection("prompts")}>
        <AvatarPromptOverrides avatarId={avatarId} />
      </CollapsibleSection>
    </Stack>
  );
}
