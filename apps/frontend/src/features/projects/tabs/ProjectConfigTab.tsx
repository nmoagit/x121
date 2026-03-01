/**
 * Placeholder for project configuration tab.
 */

import { EmptyState } from "@/components/domain";
import { Settings } from "@/tokens/icons";

export function ProjectConfigTab() {
  return (
    <EmptyState
      icon={<Settings size={32} />}
      title="Configuration"
      description="Manage project-level settings, naming rules, and workflow configuration."
    />
  );
}
