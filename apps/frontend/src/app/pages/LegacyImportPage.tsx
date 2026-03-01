/**
 * Legacy data import page (PRD-86).
 *
 * The LegacyImportWizard requires a projectId. This page provides a
 * project ID input to start a new import, then renders the wizard with
 * the correct mutation callbacks wired up.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input, LoadingPane } from "@/components/primitives";

import {
  LegacyImportWizard,
  useCommitImport,
  useCreateRun,
  useImportRun,
  useRunReport,
} from "@/features/legacy-import";
import type { MatchKey } from "@/features/legacy-import";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LegacyImportPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectInput, setProjectInput] = useState("");
  const [runId, setRunId] = useState<number | null>(null);

  const createRun = useCreateRun();
  const commitImport = useCommitImport();

  const { data: run, isLoading: runLoading } = useImportRun(runId ?? 0);
  const { data: report } = useRunReport(runId ?? 0);

  const handleStartProject = () => {
    const parsed = Number.parseInt(projectInput, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
    }
  };

  const handleCreateRun = (sourcePath: string, pid: number, matchKey: MatchKey) => {
    createRun.mutate(
      { source_path: sourcePath, project_id: pid, match_key: matchKey },
      { onSuccess: (data) => setRunId(data.id) },
    );
  };

  const handleConfirm = () => {
    if (runId) {
      commitImport.mutate({ runId, input: { run_id: runId } });
    }
  };

  /** Derive a status name from run.status_id for the wizard. */
  const statusName = run
    ? (["scanning", "mapping", "preview", "importing", "completed", "partial", "failed", "cancelled"][
        run.status_id - 1
      ] as "scanning" | "mapping" | "preview" | "importing" | "completed" | "partial" | "failed" | "cancelled") ?? "scanning"
    : "scanning";

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Legacy Data Import"
          description="Import data from legacy systems with folder scanning, mapping, and gap analysis."
        />

        {projectId === null && (
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
            <Button
              variant="primary"
              onClick={handleStartProject}
              disabled={!projectInput.trim()}
            >
              Start Import
            </Button>
          </Stack>
        )}

        {projectId !== null && runLoading && <LoadingPane />}

        {projectId !== null && (
          <LegacyImportWizard
            projectId={projectId}
            run={run ?? null}
            statusName={statusName}
            report={report ?? null}
            onCreateRun={handleCreateRun}
            onConfirm={handleConfirm}
            onCancel={() => {
              setRunId(null);
              setProjectId(null);
              setProjectInput("");
            }}
          />
        )}
      </Stack>
    </div>
  );
}
