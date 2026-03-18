/**
 * Settings tab for project detail page.
 *
 * Combines scene settings (PRD-111), workflow assignments, prompt overrides,
 * and configuration templates (PRD-74) in collapsible sections.
 */

import { useCallback, useState } from "react";

import { CollapsibleSection, ConfigToolbar } from "@/components/composite";
import { BlockingDeliverablesEditor } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { useExportProjectSettings, useConfigImport } from "@/features/config-io";
import { ConfigLibrary } from "@/features/config-templates";
import { ProjectPromptOverrides } from "@/features/prompt-management";
import { ProjectSceneSettings, ProjectWorkflowOverrides } from "@/features/scene-catalogue";
import { ProjectVideoSettings } from "@/features/video-settings";
import { useSetting } from "@/features/settings/hooks/use-settings";
import { ChevronDown, ChevronUp } from "@/tokens/icons";

import { useProject, useUpdateProject } from "../hooks/use-projects";

const DEFAULT_BLOCKING = ["metadata", "images", "scenes"];

const SECTION_IDS = ["blocking", "scenes", "workflows", "video", "prompts", "templates"] as const;
type SectionId = (typeof SECTION_IDS)[number];

interface ProjectSettingsTabProps {
  projectId: number;
  projectName?: string;
}

export function ProjectSettingsTab({ projectId, projectName = "project" }: ProjectSettingsTabProps) {
  const { exporting, exportConfig } = useExportProjectSettings();
  const { importing, importFile } = useConfigImport();
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const { data: studioSetting } = useSetting("blocking_deliverables");

  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(SECTION_IDS));

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allExpanded = openSections.size === SECTION_IDS.length;

  function toggleAll() {
    setOpenSections(allExpanded ? new Set() : new Set(SECTION_IDS));
  }

  const studioDefault = studioSetting?.value
    ? studioSetting.value.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_BLOCKING;

  const isOverridden = project?.blocking_deliverables != null;
  const blocking = project?.blocking_deliverables ?? studioDefault;

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
          onExport={() => exportConfig(projectId, projectName)}
          onImport={(file) => importFile(file)}
          exporting={exporting}
          importing={importing}
        />
      </div>

      <CollapsibleSection card
        title="Blocking Deliverables"
        description="Choose which deliverable sections must be complete for a character to be considered done. Inherited from studio defaults unless overridden."
        open={openSections.has("blocking")}
        onToggle={() => toggleSection("blocking")}
      >
        <BlockingDeliverablesEditor
          effective={blocking}
          isOverridden={isOverridden}
          inheritLabel="Inherited from Studio"
          overrideLabel="Project Override"
          resetLabel="Reset to Studio Default"
          onUpdate={(next) =>
            updateProject.mutate({ id: projectId, data: { blocking_deliverables: next } })
          }
        />
      </CollapsibleSection>

      <CollapsibleSection card
        title="Scene Settings"
        description="Enable or disable scenes for this project."
        open={openSections.has("scenes")}
        onToggle={() => toggleSection("scenes")}
      >
        <ProjectSceneSettings projectId={projectId} />
      </CollapsibleSection>

      <CollapsibleSection card
        title="Workflow Assignments"
        description="Assign workflows per scene and track combination."
        open={openSections.has("workflows")}
        onToggle={() => toggleSection("workflows")}
      >
        <ProjectWorkflowOverrides projectId={projectId} />
      </CollapsibleSection>

      <CollapsibleSection card
        title="Video Settings"
        description="Override video duration, FPS, and resolution per scene type."
        open={openSections.has("video")}
        onToggle={() => toggleSection("video")}
      >
        <ProjectVideoSettings projectId={projectId} />
      </CollapsibleSection>

      <CollapsibleSection card
        title="Prompt Overrides"
        description="Override prompt templates at the project level."
        open={openSections.has("prompts")}
        onToggle={() => toggleSection("prompts")}
      >
        <ProjectPromptOverrides projectId={projectId} />
      </CollapsibleSection>

      <CollapsibleSection card
        title="Configuration Templates"
        description="Manage reusable configuration templates."
        open={openSections.has("templates")}
        onToggle={() => toggleSection("templates")}
      >
        <ConfigLibrary projectId={projectId} />
      </CollapsibleSection>
    </Stack>
  );
}
