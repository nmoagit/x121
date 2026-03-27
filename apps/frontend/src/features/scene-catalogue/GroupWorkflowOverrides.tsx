/**
 * Group-level workflow overrides panel.
 *
 * Shows scene_type x track workflow assignments + image type workflows,
 * filtered to types enabled for this group.
 */

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import { useImageTypes } from "@/features/image-catalogue/hooks/use-image-catalogue";
import { useGroupImageSettings } from "@/features/image-catalogue/hooks/use-group-image-settings";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import";

import { ImageWorkflowTable } from "./ImageWorkflowTable";
import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";
import { useGroupSceneSettings } from "./hooks/use-group-scene-settings";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GroupWorkflowOverridesProps {
  projectId: number;
  groupId: number;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function GroupWorkflowOverrides({ projectId, groupId }: GroupWorkflowOverridesProps) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: allEntries, isLoading: loadingEntries } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: settings, isLoading: loadingSettings } = useGroupSceneSettings(projectId, groupId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);
  const { data: imageTypes, isLoading: loadingImages } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: imageSettings, isLoading: loadingImageSettings } = useGroupImageSettings(projectId, groupId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);

  if (loadingEntries || loadingSettings || loadingWorkflows || loadingImages || loadingImageSettings) return <LoadingPane />;

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

  const enabledImageTypeIds = new Set(
    (imageSettings ?? []).filter((s) => s.is_enabled).map((s) => s.image_type_id),
  );
  const enabledImageTypes = (imageTypes ?? []).filter(
    (it) => it.is_active && (enabledImageTypeIds.size === 0 || enabledImageTypeIds.has(it.id)),
  );

  const workflowOptions = (workflows ?? []).map((w) => ({
    value: String(w.id),
    label: w.name,
  }));

  if (!entries.length && !enabledImageTypes.length) {
    return (
      <EmptyState
        title="No Workflow Assignments"
        description="Enable scenes and image types in the group's overrides to configure workflows."
        icon={<Workflow />}
      />
    );
  }

  return (
    <Stack gap={4}>
      {enabledImageTypes.length > 0 && (
        <ImageWorkflowTable
          imageTypes={enabledImageTypes}
          workflowOptions={workflowOptions}
          tracks={tracks ?? []}
          editable
        />
      )}
      {entries.length > 0 && (
        <WorkflowAssignmentTable
          entries={entries}
          workflowOptions={workflowOptions}
          enabledTrackKeys={enabledTrackKeys}
        />
      )}
    </Stack>
  );
}
