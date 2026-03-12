/**
 * Embedded activity console filtered to infrastructure-related sources.
 *
 * Delegates to the shared FilteredActivityLog component with
 * infrastructure-specific source filters.
 */

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import { FilteredActivityLog } from "@/features/activity-console";
import type { ActivityLogSource } from "@/features/activity-console";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const INFRA_SOURCES: ReadonlySet<ActivityLogSource> = new Set([
  "comfyui",
  "worker",
  "pipeline",
]);

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function InfrastructureActivityLog() {
  return (
    <CollapsibleSection title="Activity Log" defaultOpen={false}>
      <FilteredActivityLog
        sources={INFRA_SOURCES}
        emptyText="No infrastructure activity yet"
      />
    </CollapsibleSection>
  );
}
