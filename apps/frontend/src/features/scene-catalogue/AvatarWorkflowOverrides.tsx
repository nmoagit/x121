/**
 * Avatar-level workflow overrides panel.
 *
 * Shows scene_type x track workflow assignments inherited from the scene
 * catalogue, filtered to scenes enabled for this avatar.
 */

import { EmptyState } from "@/components/domain";
import { LoadingPane } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import { useWorkflows } from "@/features/workflow-import";

import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";
import { useAvatarSceneSettings } from "./hooks/use-avatar-scene-settings";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarWorkflowOverridesProps {
  avatarId: number;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function AvatarWorkflowOverrides({ avatarId }: AvatarWorkflowOverridesProps) {
  const { data: allEntries, isLoading: loadingEntries } = useSceneCatalogue();
  const { data: settings, isLoading: loadingSettings } = useAvatarSceneSettings(avatarId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows();

  if (loadingEntries || loadingSettings || loadingWorkflows) return <LoadingPane />;

  const enabledSettings = (settings ?? []).filter((s) => s.is_enabled);
  const enabledSceneTypeIds = new Set(enabledSettings.map((s) => s.scene_type_id));
  const enabledTrackKeys = new Set(
    enabledSettings
      .filter((s) => s.track_id != null)
      .map((s) => `${s.scene_type_id}:${s.track_id}`),
  );

  const entries = (allEntries ?? []).filter(
    (e) => enabledSceneTypeIds.has(e.id) && e.tracks.length > 0,
  );

  if (!entries.length) {
    return (
      <EmptyState
        title="No Scene + Track Combinations"
        description="Enable scenes in Scene Settings to configure workflows."
        icon={<Workflow />}
      />
    );
  }

  const workflowOptions = (workflows ?? []).map((w) => ({
    value: String(w.id),
    label: w.name,
  }));

  return (
    <WorkflowAssignmentTable
      entries={entries}
      workflowOptions={workflowOptions}
      enabledTrackKeys={enabledTrackKeys}
    />
  );
}
