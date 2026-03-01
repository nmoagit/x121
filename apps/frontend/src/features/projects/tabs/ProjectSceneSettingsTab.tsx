/**
 * Placeholder for project scene settings tab.
 */

import { EmptyState } from "@/components/domain";
import { Settings } from "@/tokens/icons";

export function ProjectSceneSettingsTab() {
  return (
    <EmptyState
      icon={<Settings size={32} />}
      title="Scene Settings"
      description="Configure scene types, transitions, and generation parameters for this project."
    />
  );
}
