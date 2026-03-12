/**
 * Embedded activity console filtered to pipeline/queue events (PRD-132).
 *
 * Delegates to the shared FilteredActivityLog component with queue-specific
 * source filters.
 */

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import { FilteredActivityLog } from "@/features/activity-console";
import type { ActivityLogSource } from "@/features/activity-console";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const QUEUE_SOURCES: ReadonlySet<ActivityLogSource> = new Set([
  "pipeline",
  "worker",
]);

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QueueActivityLog() {
  return (
    <CollapsibleSection title="Queue Activity" defaultOpen={false}>
      <FilteredActivityLog
        sources={QUEUE_SOURCES}
        emptyText="No queue activity yet"
      />
    </CollapsibleSection>
  );
}
