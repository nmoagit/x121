/**
 * Placeholder for project production tab (PRD-112).
 *
 * Depends on PRD-103 (Generation Pipeline) being implemented.
 */

import { EmptyState } from "@/components/domain";
import { Zap } from "@/tokens/icons";

export function ProjectProductionTab() {
  return (
    <EmptyState
      icon={<Zap size={32} />}
      title="Production"
      description="Production queue and generation management will be available once PRD-103 is implemented."
    />
  );
}
