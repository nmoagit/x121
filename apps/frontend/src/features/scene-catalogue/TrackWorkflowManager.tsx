/**
 * Flat table of all (scene_type, track) workflow assignments.
 *
 * Displays every scene type x track combination in a single table,
 * each with an inline workflow dropdown.
 */

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import { useWorkflows } from "@/features/workflow-import";

import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TrackWorkflowManager() {
  const { data: entries, isLoading: loadingEntries } = useSceneCatalogue();
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows();

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
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Workflow Assignments
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Assign workflows per scene type and track combination.
        </p>
      </div>

      <WorkflowAssignmentTable entries={entriesWithTracks} workflowOptions={workflowOptions} />
    </Stack>
  );
}
