/**
 * Placeholder for project delivery tab (PRD-112).
 *
 * Depends on PRD-106 (Delivery Pipeline) being implemented.
 */

import { EmptyState } from "@/components/domain";
import { Download } from "@/tokens/icons";

export function ProjectDeliveryTab() {
  return (
    <EmptyState
      icon={<Download size={32} />}
      title="Delivery"
      description="Delivery readiness and export management will be available once PRD-106 is implemented."
    />
  );
}
