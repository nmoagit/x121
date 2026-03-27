/**
 * Project-level workflow overrides panel.
 *
 * Shows scene_type x track workflow assignments + image type workflows,
 * filtered to types enabled for this project.
 */

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import { useImageTypes } from "@/features/image-catalogue/hooks/use-image-catalogue";
import { useProjectImageSettings } from "@/features/image-catalogue/hooks/use-project-image-settings";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import";

import { ImageWorkflowTable } from "./ImageWorkflowTable";
import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";
import { useProjectSceneSettings } from "./hooks/use-project-scene-settings";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectWorkflowOverridesProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ProjectWorkflowOverrides({ projectId }: ProjectWorkflowOverridesProps) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: allEntries, isLoading: loadingEntries } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: settings, isLoading: loadingSettings } = useProjectSceneSettings(projectId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);
  const { data: imageTypes, isLoading: loadingImages } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: imageSettings, isLoading: loadingImageSettings } = useProjectImageSettings(projectId);
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

  // Image types enabled at project level
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
        description="Enable scenes and image types in settings above to configure workflows."
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
