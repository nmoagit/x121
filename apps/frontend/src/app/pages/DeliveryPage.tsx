/**
 * Delivery page — project picker wrapping export panel,
 * validation report, format profile manager, and export history.
 *
 * Flow: Project -> ExportPanel + ValidationReport + FormatProfileManager + ExportHistory
 */

import { Stack } from "@/components/layout";
import { ProjectPicker } from "@/components/domain";

import {
  ExportPanel,
  ValidationReport,
  FormatProfileManager,
  ExportHistory,
} from "@/features/delivery";

function ProjectDelivery({ projectId }: { projectId: number }) {
  return (
    <Stack gap={6}>
      <ExportPanel projectId={projectId} />
      <ValidationReport projectId={projectId} />
      <ExportHistory projectId={projectId} />
      <FormatProfileManager />
    </Stack>
  );
}

export function DeliveryPage() {
  return (
    <ProjectPicker
      title="Delivery"
      description="Package and export completed scenes for delivery."
    >
      {(projectId) => <ProjectDelivery projectId={projectId} />}
    </ProjectPicker>
  );
}
