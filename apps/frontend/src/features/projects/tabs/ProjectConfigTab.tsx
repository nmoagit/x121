/**
 * Settings tab for project detail page.
 *
 * Combines scene settings (PRD-111) and configuration templates (PRD-74)
 * in a single tab.
 */

import { Stack } from "@/components/layout";
import { ConfigLibrary } from "@/features/config-templates";
import { ProjectSceneSettings } from "@/features/scene-catalog";

interface ProjectSettingsTabProps {
  projectId: number;
}

export function ProjectSettingsTab({ projectId }: ProjectSettingsTabProps) {
  return (
    <Stack gap={8}>
      <ProjectSceneSettings projectId={projectId} />
      <ConfigLibrary projectId={projectId} />
    </Stack>
  );
}
