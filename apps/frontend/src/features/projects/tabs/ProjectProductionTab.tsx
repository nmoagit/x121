/**
 * Placeholder for project production tab.
 */

import { EmptyState } from "@/components/domain";
import { Zap } from "@/tokens/icons";

export function ProjectProductionTab() {
  return (
    <EmptyState
      icon={<Zap size={32} />}
      title="Production"
      description="Queue scenes for generation, monitor progress, and manage production batches."
    />
  );
}
