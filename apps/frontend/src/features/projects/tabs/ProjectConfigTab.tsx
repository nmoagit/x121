/**
 * Configuration tab for project detail page.
 *
 * Delegates to the ConfigLibrary feature component (PRD-74).
 */

import { ConfigLibrary } from "@/features/config-templates";

interface ProjectConfigTabProps {
  projectId: number;
}

export function ProjectConfigTab({ projectId }: ProjectConfigTabProps) {
  return <ConfigLibrary projectId={projectId} />;
}
