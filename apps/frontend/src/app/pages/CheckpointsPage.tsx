/**
 * Checkpoints page — job ID picker wrapping the pipeline stage diagram
 * and resume dialog components.
 *
 * Flow: Job ID (typed) -> PipelineStageDiagram + ResumeDialog
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Input, LoadingPane } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Activity } from "@/tokens/icons";

import {
  PipelineStageDiagram,
  ResumeDialog,
  useCheckpoints,
  useFailureDiagnostics,
  derivePipelineStages,
} from "@/features/checkpoints";
import type { Checkpoint } from "@/features/checkpoints";

/** Default total pipeline stages when the API doesn't specify. */
const DEFAULT_TOTAL_STAGES = 6;

function JobCheckpoints({ jobId }: { jobId: number }) {
  const [showResume, setShowResume] = useState(false);

  const { data: checkpoints, isLoading: cpLoading } = useCheckpoints(jobId);
  const { data: diagnostics } = useFailureDiagnostics(jobId);

  if (cpLoading) {
    return <LoadingPane />;
  }

  const cpList = checkpoints ?? [];
  const maxStageIndex = cpList.reduce(
    (max, cp) => Math.max(max, cp.stage_index),
    -1,
  );
  const totalStages = Math.max(maxStageIndex + 1, DEFAULT_TOTAL_STAGES);
  const failureStageIndex = diagnostics?.failure_stage_index ?? null;

  const stages = derivePipelineStages(cpList, totalStages, failureStageIndex);
  const hasFailed = stages.some((s) => s.status === "failed");
  const lastCheckpoint: Checkpoint | undefined = cpList.at(-1);

  return (
    <Stack gap={4}>
      <PipelineStageDiagram
        stages={stages}
        diagnostics={diagnostics?.failure_diagnostics ?? null}
        canResume={hasFailed}
        onResume={() => setShowResume(true)}
      />

      {showResume && lastCheckpoint && (
        <ResumeDialog
          jobId={jobId}
          checkpoint={lastCheckpoint}
          onClose={() => setShowResume(false)}
          onSuccess={() => setShowResume(false)}
        />
      )}
    </Stack>
  );
}

export function CheckpointsPage() {
  const [jobIdInput, setJobIdInput] = useState("");
  const jobId = Number(jobIdInput);
  const hasJob = jobId > 0;

  return (
    <Stack gap={6}>
      <PageHeader
        title="Pipeline Checkpoints"
        description="View pipeline stage diagrams and manage checkpoint data for generation runs."
      />

      <div className="w-[200px]">
        <Input
          label="Job ID"
          type="number"
          placeholder="Enter job ID..."
          value={jobIdInput}
          onChange={(e) => setJobIdInput(e.target.value)}
          min="1"
        />
      </div>

      {hasJob ? (
        <JobCheckpoints jobId={jobId} />
      ) : (
        <EmptyState
          icon={<Activity size={32} />}
          title="Enter a job ID"
          description="Type a job ID above to view its pipeline checkpoints and diagnostics."
        />
      )}
    </Stack>
  );
}
