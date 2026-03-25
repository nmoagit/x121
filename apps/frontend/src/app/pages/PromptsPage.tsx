/**
 * Prompts page — scene type picker wrapping the prompt editor
 * and version timeline.
 *
 * Flow: Project (optional) -> Scene Type -> PromptEditor + VersionTimeline
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { LoadingPane, Select ,  ContextLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { toSelectOptionsBy } from "@/lib/select-utils";
import { FileText } from "@/tokens/icons";

import {
  PromptEditor,
  VersionTimeline,
  usePromptVersions,
  useSavePromptVersion,
  useRestoreVersion,
} from "@/features/prompt-editor";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";

function SceneTypePromptEditor({ sceneTypeId }: { sceneTypeId: number }) {
  const { data: versions, isLoading } = usePromptVersions(sceneTypeId);
  const saveVersion = useSavePromptVersion();
  const restoreVersion = useRestoreVersion(sceneTypeId);

  if (isLoading) {
    return <LoadingPane />;
  }

  const latestVersion = versions?.[0];

  return (
    <Stack gap={6}>
      <PromptEditor
        sceneTypeId={sceneTypeId}
        initialPositive={latestVersion?.positive_prompt ?? ""}
        initialNegative={latestVersion?.negative_prompt ?? ""}
        isSaving={saveVersion.isPending}
        onSave={(data) =>
          saveVersion.mutate({
            scene_type_id: sceneTypeId,
            ...data,
          })
        }
      />
      <VersionTimeline
        sceneTypeId={sceneTypeId}
        versions={versions ?? []}
        onRestore={(versionId) => restoreVersion.mutate(versionId)}
        isRestoring={restoreVersion.isPending}
      />
    </Stack>
  );
}

export function PromptsPage() {
  const [selectedSceneTypeId, setSelectedSceneTypeId] = useState("");
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneTypes, isLoading } = useSceneTypes(undefined, pipelineCtx?.pipelineId);

  const sceneTypeId = Number(selectedSceneTypeId);

  const sceneTypeOptions = toSelectOptionsBy(
    sceneTypes,
    (st) => st.name,
  );

  return (
    <Stack gap={6}>
      <PageHeader
        title="Prompt Editor"
        description="Edit prompt templates and view version history for scene types."
      />

      <div className="w-[300px]">
        {isLoading ? (
          <ContextLoader size={32} />
        ) : (
          <Select
            label="Scene Type"
            placeholder="Select a scene type..."
            options={sceneTypeOptions}
            value={selectedSceneTypeId}
            onChange={setSelectedSceneTypeId}
          />
        )}
      </div>

      {sceneTypeId > 0 ? (
        <SceneTypePromptEditor sceneTypeId={sceneTypeId} />
      ) : (
        <EmptyState
          icon={<FileText size={32} />}
          title="Select a scene type"
          description="Choose a scene type from the dropdown above to edit its prompt templates."
        />
      )}
    </Stack>
  );
}
