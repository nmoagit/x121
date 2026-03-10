/**
 * Page wrapper for the Queue Manager dashboard (PRD-132).
 *
 * No required props — directly renders the feature component.
 */

import { QueueManagerPage as QueueManagerFeature } from "@/features/queue/QueueManagerPage";

export function QueueManagerPage() {
  return <QueueManagerFeature />;
}
