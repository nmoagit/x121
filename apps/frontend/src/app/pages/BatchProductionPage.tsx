/**
 * Batch Production page — project picker wrapping batch review
 * components (progress, assignments, auto-approve, action bar).
 *
 * Flow: Project -> ReviewProgressBar + AssignmentManager + AutoApproveAction
 */

import { Stack } from "@/components/layout";
import { ProjectPicker } from "@/components/domain";

import {
  ReviewProgressBar,
  AssignmentManager,
  AutoApproveAction,
} from "@/features/batch-review";

function BatchReviewDashboard({ projectId }: { projectId: number }) {
  return (
    <Stack gap={6}>
      <ReviewProgressBar projectId={projectId} />
      <AutoApproveAction projectId={projectId} />
      <AssignmentManager projectId={projectId} />
    </Stack>
  );
}

export function BatchProductionPage() {
  return (
    <ProjectPicker
      title="Batch Production"
      description="Create and manage batch production runs for bulk scene generation."
    >
      {(projectId) => <BatchReviewDashboard projectId={projectId} />}
    </ProjectPicker>
  );
}
