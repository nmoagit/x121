/**
 * Project overview tab showing stats and quick actions (PRD-112).
 */

import { Card } from "@/components/composite";
import { FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { FileAssignmentModal } from "@/features/characters/components";
import { SECTION_HEADING } from "@/lib/ui-classes";

import { CharacterDeliverablesGrid } from "../components/CharacterDeliverablesGrid";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import { ImportProgressBar } from "../components/ImportProgressBar";
import { useCharacterImport } from "../hooks/use-character-import";
import { useProjectCharacters } from "../hooks/use-project-characters";
import type { ProjectStats } from "../types";

/* --------------------------------------------------------------------------
   Stat card helper
   -------------------------------------------------------------------------- */

interface StatItemProps {
  label: string;
  value: number | string;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <Card elevation="flat" padding="md">
      <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectOverviewTabProps {
  projectId: number;
  stats?: ProjectStats;
}

export function ProjectOverviewTab({ projectId, stats }: ProjectOverviewTabProps) {
  const charImport = useCharacterImport(projectId);
  const { data: characters } = useProjectCharacters(projectId);
  const existingNames = characters?.map((c) => c.name) ?? [];

  if (!stats) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-4)]">
        Loading project statistics...
      </p>
    );
  }

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      onFolderDropped={charImport.handleFolderDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
    <Stack gap={6}>
      {/* Character stats */}
      <div>
        <h2 className={`${SECTION_HEADING} mb-[var(--spacing-3)]`}>
          Characters
        </h2>
        <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-4">
          <StatItem label="Total" value={stats.character_count} />
          <StatItem label="Ready" value={stats.characters_ready} />
          <StatItem label="Generating" value={stats.characters_generating} />
          <StatItem label="Complete" value={stats.characters_complete} />
        </div>
      </div>

      {/* Scene stats */}
      <div>
        <h2 className={`${SECTION_HEADING} mb-[var(--spacing-3)]`}>
          Scenes
        </h2>
        <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-5">
          <StatItem label="Enabled" value={stats.scenes_enabled} />
          <StatItem label="Generated" value={stats.scenes_generated} />
          <StatItem label="Approved" value={stats.scenes_approved} />
          <StatItem label="Rejected" value={stats.scenes_rejected} />
          <StatItem label="Pending" value={stats.scenes_pending} />
        </div>
      </div>

      {/* Delivery readiness */}
      <div>
        <h2 className={`${SECTION_HEADING} mb-[var(--spacing-3)]`}>
          Delivery Readiness
        </h2>
        <div className="grid grid-cols-1 gap-[var(--spacing-3)] sm:grid-cols-2">
          <StatItem
            label="Overall Readiness"
            value={`${stats.delivery_readiness_pct.toFixed(1)}%`}
          />
        </div>
      </div>

      {/* Per-character deliverables grid */}
      <div>
        <h2 className={`${SECTION_HEADING} mb-[var(--spacing-3)]`}>
          Model Deliverables
        </h2>
        <CharacterDeliverablesGrid projectId={projectId} />
      </div>
    </Stack>

    {charImport.importProgress && charImport.importProgress.phase !== "done" && (
      <ImportProgressBar progress={charImport.importProgress} />
    )}

    <FileAssignmentModal
      open={charImport.unmatchedFiles.length > 0}
      onClose={charImport.dismissUnmatchedFiles}
      unmatchedFiles={charImport.unmatchedFiles}
      onConfirm={(assignments) => charImport.resolveUnmatchedFiles(assignments)}
    />

    <ImportConfirmModal
      open={charImport.importOpen}
      onClose={charImport.closeImport}
      names={charImport.importNames}
      payloads={charImport.importPayloads}
      projectId={projectId}
      existingNames={existingNames}
      characters={characters}
      onConfirm={charImport.handleImportConfirm}
      onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
      loading={charImport.bulkCreatePending}
      importProgress={charImport.importProgress}
      onAbort={charImport.abortImport}
      detectedProjectName={charImport.importResult?.detectedProjectName}
      existingGroupNames={charImport.importResult ? [...charImport.importResult.groupedPayloads.keys()].filter(Boolean) : undefined}
      hashSummary={charImport.hashSummary}
    />
    </FileDropZone>
  );
}
