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
  const [allCharacters, setAllCharacters] = useState(true);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const validationCharacterIds = allCharacters ? null : selectedCharacterIds;

  return (
    <Stack gap={6}>
      <ExportPanel
        projectId={projectId}
        allCharacters={allCharacters}
        onAllCharactersChange={setAllCharacters}
        selectedCharacterIds={selectedCharacterIds}
        onSelectedCharacterIdsChange={setSelectedCharacterIds}
      />
      <ValidationReport projectId={projectId} characterIds={validationCharacterIds} />
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
