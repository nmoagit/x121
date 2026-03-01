/**
 * Interactive job debugger page (PRD-34).
 *
 * Allows a user to enter a job ID, then displays the debug controls,
 * intermediate latent previews, and a mid-run parameter editor.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input, LoadingPane } from "@/components/primitives";

import {
  AbortDialog,
  JobControls,
  LatentPreview,
  MidRunParamEditor,
  useAbortJob,
  useJobDebugState,
  useJobPreview,
  usePauseJob,
  useResumeJob,
  useUpdateParams,
} from "@/features/debugger";
import type { JobControlStatus } from "@/features/debugger";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Derive a control status from the debug state fields. */
function deriveControlStatus(state: {
  abort_reason: string | null;
  paused_at_step: number | null;
}): JobControlStatus {
  if (state.abort_reason) return "aborted";
  if (state.paused_at_step !== null) return "paused";
  return "running";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DebuggerPage() {
  const [jobId, setJobId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showAbortDialog, setShowAbortDialog] = useState(false);

  const activeJobId = jobId ?? 0;

  const { data: debugState, isLoading: stateLoading } = useJobDebugState(activeJobId);
  const { data: previews = [] } = useJobPreview(activeJobId);

  const pauseMutation = usePauseJob();
  const resumeMutation = useResumeJob();
  const abortMutation = useAbortJob();
  const updateParamsMutation = useUpdateParams(activeJobId);

  const isMutating = pauseMutation.isPending || resumeMutation.isPending || abortMutation.isPending;

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setJobId(parsed);
    }
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Job Debugger"
          description="Inspect, pause, resume, and tweak running generation jobs."
        />

        {/* Job ID input */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Job ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter job ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {/* Loading state */}
        {jobId !== null && stateLoading && <LoadingPane />}

        {/* Debug UI */}
        {jobId !== null &&
          debugState &&
          (() => {
            const controlStatus = deriveControlStatus(debugState);
            return (
              <Stack gap={4}>
                <JobControls
                  status={controlStatus}
                  isLoading={isMutating}
                  onPause={() => pauseMutation.mutate({ jobId: activeJobId })}
                  onResume={() => resumeMutation.mutate({ jobId: activeJobId })}
                  onAbort={() => setShowAbortDialog(true)}
                />

                <LatentPreview previews={previews} />

                {controlStatus === "paused" && (
                  <MidRunParamEditor
                    currentParams={debugState.modified_params ?? {}}
                    onSave={(params) => updateParamsMutation.mutate({ params })}
                    isSaving={updateParamsMutation.isPending}
                  />
                )}
              </Stack>
            );
          })()}

        {/* Empty state */}
        {jobId === null && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a job ID above to begin debugging.
          </p>
        )}

        {/* Abort dialog */}
        {showAbortDialog && (
          <AbortDialog
            onConfirm={(reason) => {
              abortMutation.mutate(
                { jobId: activeJobId, input: reason ? { reason } : undefined },
                { onSuccess: () => setShowAbortDialog(false) },
              );
            }}
            onCancel={() => setShowAbortDialog(false)}
            isAborting={abortMutation.isPending}
          />
        )}
      </Stack>
    </div>
  );
}
