/**
 * Placeholder for project delivery tab.
 */

import { EmptyState } from "@/components/domain";
import { Download } from "@/tokens/icons";

export function ProjectDeliveryTab() {
  return (
    <EmptyState
      icon={<Download size={32} />}
      title="Delivery"
      description="Review delivery readiness, export final videos, and manage distribution packages."
    />
  );
}
