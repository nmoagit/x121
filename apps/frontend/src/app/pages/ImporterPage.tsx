/**
 * Folder-to-entity bulk importer page (PRD-16).
 *
 * Provides a multi-step import flow: select project, drop a folder,
 * review the preview tree, and commit. Shows progress when committing.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";

import {
  FolderDropZone,
  ImportPreviewTree,
  ImportProgress,
  useCommitImport,
  useImportPreview,
} from "@/features/importer";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImporterPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectInput, setProjectInput] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [deselectedIds, setDeselectedIds] = useState<number[]>([]);

  const { data: preview } = useImportPreview(sessionId);
  const commitMutation = useCommitImport();

  const handleLoadProject = () => {
    const parsed = Number.parseInt(projectInput, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
      setSessionId(null);
    }
  };

  const handleCommit = () => {
    if (sessionId === null) return;
    commitMutation.mutate({ sessionId, deselectedEntryIds: deselectedIds });
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Folder Importer"
          description="Import avatars and assets from a folder structure into a project."
        />

        {/* Project selector */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Project ID"
              type="number"
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="Enter project ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoadProject} disabled={!projectInput.trim()}>
            Select Project
          </Button>
        </Stack>

        {/* Drop zone */}
        {projectId !== null && sessionId === null && (
          <FolderDropZone projectId={projectId} onUploadComplete={(id) => setSessionId(id)} />
        )}

        {/* Preview tree */}
        {preview && (
          <Stack gap={4}>
            <ImportPreviewTree preview={preview} onSelectionChange={setDeselectedIds} />

            <div className="flex justify-end">
              <Button variant="primary" onClick={handleCommit} disabled={commitMutation.isPending}>
                {commitMutation.isPending ? "Committing..." : "Commit Import"}
              </Button>
            </div>
          </Stack>
        )}

        {/* Progress */}
        <ImportProgress
          isCommitting={commitMutation.isPending}
          result={commitMutation.data ?? null}
        />

        {/* Empty state */}
        {projectId === null && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a project ID above to begin importing.
          </p>
        )}
      </Stack>
    </div>
  );
}
