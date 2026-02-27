/**
 * Placeholder for project configuration tab (PRD-112).
 *
 * Will contain project-level settings such as naming rules,
 * workflow presets, and integration configuration.
 */

import { EmptyState } from "@/components/domain";
import { Settings } from "@/tokens/icons";

export function ProjectConfigTab() {
  return (
    <EmptyState
      icon={<Settings size={32} />}
      title="Configuration"
      description="Project-level configuration will be available in a future update."
    />
  );
}
