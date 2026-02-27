/**
 * Placeholder for project scene settings tab (PRD-112).
 *
 * Depends on PRD-107 (Scene Type Config) being implemented.
 */

import { EmptyState } from "@/components/domain";
import { Settings } from "@/tokens/icons";

export function ProjectSceneSettingsTab() {
  return (
    <EmptyState
      icon={<Settings size={32} />}
      title="Scene Settings"
      description="Scene type configuration will be available once PRD-107 is implemented."
    />
  );
}
