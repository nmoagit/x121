/**
 * Scene settings tab for project detail page.
 *
 * Delegates to the ProjectSceneSettings feature component (PRD-111).
 */

import { ProjectSceneSettings } from "@/features/scene-catalog";

interface ProjectSceneSettingsTabProps {
  projectId: number;
}

export function ProjectSceneSettingsTab({ projectId }: ProjectSceneSettingsTabProps) {
  return <ProjectSceneSettings projectId={projectId} />;
}
