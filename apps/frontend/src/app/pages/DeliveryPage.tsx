/**
 * Delivery page — project picker wrapping export panel,
 * validation report, format profile manager, and export history.
 *
 * Flow: Project -> ExportPanel + ValidationReport + FormatProfileManager + ExportHistory
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { ProjectPicker } from "@/components/domain";

import {
  ExportPanel,
  ValidationReport,
  FormatProfileManager,
  ExportHistory,
} from "@/features/delivery";

function ProjectDelivery({ projectId }: { projectId: number }) {
  const [allAvatars, setAllAvatars] = useState(true);
  const [selectedAvatarIds, setSelectedAvatarIds] = useState<number[]>([]);
  const validationAvatarIds = allAvatars ? null : selectedAvatarIds;

  return (
    <Stack gap={6}>
      <ExportPanel
        projectId={projectId}
        allAvatars={allAvatars}
        onAllAvatarsChange={setAllAvatars}
        selectedAvatarIds={selectedAvatarIds}
        onSelectedAvatarIdsChange={setSelectedAvatarIds}
      />
      <ValidationReport projectId={projectId} avatarIds={validationAvatarIds} />
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
