/**
 * Flat table of all (scene_type, track) workflow assignments.
 *
 * Displays every scene type x track combination in a single table,
 * each with an inline workflow dropdown.
 */

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { TERMINAL_HEADER_TITLE } from "@/lib/ui-classes";
import { Workflow } from "@/tokens/icons";

import { usePipelineContextSafe } from "@/features/pipelines";
import { useWorkflows } from "@/features/workflow-import";

import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TrackWorkflowManager() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: entries, isLoading: loadingEntries } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);

  if (loadingEntries || loadingWorkflows) return <LoadingPane />;

  const entriesWithTracks = (entries ?? []).filter((e) => e.tracks.length > 0);

  if (!entriesWithTracks.length) {
    return (
      <EmptyState
        title="No Scene + Track Combinations"
        description="Create scene types and assign tracks to configure workflows."
        icon={<Workflow />}
      />
    );
  }

  const workflowOptions = (workflows ?? []).map((w) => ({
    value: String(w.id),
    label: w.name,
  }));

  return (
    <Stack gap={6}>
      <div>
        <h2 className={TERMINAL_HEADER_TITLE}>Workflow Assignments</h2>
        <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">
          Assign workflows per scene type and track combination.
        </p>
      </div>

      <WorkflowAssignmentTable entries={entriesWithTracks} workflowOptions={workflowOptions} />
    </Stack>
  );
}
